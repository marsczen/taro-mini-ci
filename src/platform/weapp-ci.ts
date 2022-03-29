// /* eslint-disable no-console */
import * as path from 'path'
import * as os from 'os'
import * as cp from 'child_process'
import chalk from 'chalk';
import fs from 'fs';
import {  Project } from 'miniprogram-ci';
import * as ci from 'miniprogram-ci'
import BaseCI from '../base-ci';
import {  handleProgress } from '../utils/utils';
import { printLog } from '../utils/console';


const rootPath = process.cwd()

export default class WeappCI extends BaseCI {
  private instance: Project;
  /** 微信开发者安装路径 */
  private devToolsInstallPath: string;

  _init () {
    if (this.deployConfig.weapp == null) {
      throw new Error('请为"taro-workflow"插件配置 "weapp" 选项')
    }
    this.devToolsInstallPath = this.deployConfig.weapp.devToolsInstallPath || (process.platform === 'darwin' ? '/Applications/wechatwebdevtools.app' : 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具')
    delete this.deployConfig.weapp.devToolsInstallPath

    const weappConfig: any = {
      type: 'miniProgram',
      projectPath: this.deployConfig.projectPath,
      ignores: ['node_modules/**/*'],
      ...this.deployConfig.weapp!
    }
    const privateKeyPath = path.isAbsolute(weappConfig.privateKeyPath) ? weappConfig.privateKeyPath : path.join(this.appPath, weappConfig.privateKeyPath)
    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`"weapp.privateKeyPath"选项配置的路径不存在,本次上传终止:${privateKeyPath}`)
    }
    this.instance = new ci.Project(weappConfig)
  }


  async open () {
    // 检查安装路径是否存在
    if (!(await fs.existsSync(this.devToolsInstallPath))) {
      printLog.error('微信开发者工具安装路径不存在', this.devToolsInstallPath)
      return
    }
    /** 命令行工具所在路径 */
    const cliPath = path.join(this.devToolsInstallPath, os.platform() === 'win32' ? '/cli.bat' : '/Contents/MacOS/cli')
    const isWindows = os.platform() === 'win32'

    // 检查是否开启了命令行
    const errMesg = '工具的服务端口已关闭。要使用命令行调用工具，请打开工具 -> 设置 -> 安全设置，将服务端口开启。详细信息: https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html'
    const installPath = isWindows ? this.devToolsInstallPath : `${this.devToolsInstallPath}/Contents/MacOS`
    const md5 = require('crypto').createHash('md5').update(installPath).digest('hex')
    const USER_HOME  = process.platform === 'win32' ? process.env.HOMEPATH : process.env.HOME
    const ideStatusFile = path.join(
      USER_HOME,
      isWindows
      ? `/AppData/Local/微信开发者工具/User Data/${md5}/Default/.ide-status`
      : `/Library/Application Support/微信开发者工具/${md5}/Default/.ide-status`
    )
    if (!(await fs.existsSync(ideStatusFile))) {
      printLog.error(errMesg)
      return
    }
    fs.readFile(ideStatusFile, 'utf8', (err, data) => {
      if (data === 'Off') {
        printLog.error(errMesg)
        return
      }
    })

    if (!(await fs.existsSync(cliPath))) {
      printLog.error('命令行工具路径不存在', cliPath)
    }
    printLog.pending( '微信开发者工具...')
    cp.exec(`${cliPath} open --project ${this.appPath}`, (err) => {
      if (err) {
        printLog.error(err.message)
      }
    })
  }

  async preview () {
    try {
      printLog.info('上传开发版代码到微信后台并预览')
      const uploadResult = await ci.preview({
        project: this.instance,
        version: this.version,
        desc: this.desc,
        setting: {
          ...this.instance,
          minify: true
        },
        onProgressUpdate: handleProgress,
        threads: os.cpus.length
      })

      if (uploadResult.subPackageInfo) {
        const allPackageInfo = uploadResult.subPackageInfo.find((item) => item.name === '__FULL__')
        const mainPackageInfo = uploadResult.subPackageInfo.find((item) => item.name === '__APP__')
        const extInfo = `本次上传${allPackageInfo!.size / 1024}kb ${mainPackageInfo ? ',其中主包' + mainPackageInfo.size + 'kb' : ''}`
        console.log(chalk.green(`上传成功 ${new Date().toLocaleString()} ${extInfo}`))
      }
    } catch (error) {
      console.log(chalk.red(`上传失败 ${new Date().toLocaleString()} \n${error.message}`))
    }
  }

  async upload () {
    try {
      printLog.info('上传体验版代码到微信后台')
      printLog.info(`本次上传版本号为："${this.version}"，上传描述为：“${this.desc}”`)
      const uploadResult = await ci.upload({
        project: this.instance,
        version: this.version,
        desc: this.desc,
        setting: {
          ...this.instance,
          minify: true
        },
        onProgressUpdate: handleProgress,
        threads: os.cpus.length
      })
      // const resultTable = this.handleUploadResult(uploadResult);

      if (uploadResult.subPackageInfo) {
        const allPackageInfo = uploadResult.subPackageInfo.find((item) => item.name === '__FULL__')
        const mainPackageInfo = uploadResult.subPackageInfo.find((item) => item.name === '__APP__')
        const extInfo = `本次上传${allPackageInfo!.size / 1024}kb ${mainPackageInfo ? ',其中主包' + mainPackageInfo.size + 'kb' : ''}`
        console.log(chalk.green(`上传成功 ${new Date().toLocaleString()} ${extInfo}`))
      }
    } catch (error) {
      console.log(chalk.red(`上传失败 ${new Date().toLocaleString()} \n${error.message}`))
    }
  }
}
