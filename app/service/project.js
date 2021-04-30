const Service = require('egg').Service;
const { Octokit } = require("@octokit/core");
const download = require('download-git-repo');
const utils = require('../utils/fileUtils');
const fs = require('fs');
const process = require('child_process');

function downloadFunc(downloadRepoUrl, temp_dest) {
  return new Promise(async (resolve, reject) => {
    downloadRepoUrl = downloadRepoUrl.replace(/\ +/g,"").replace(/[\r\n]/g,""); // 去除空格和换行符
    download(downloadRepoUrl, temp_dest,  (err) => {
      if (err) {
        console.log(err);
        console.log('请求模板下载成功');
        reject('请求模板下载失败');
      } else {
        console.log('请求模板下载成功');
        resolve('请求模板下载成功');
      }
    })
  });
}

async function release(repoUrl, repoName) {
  const exec = process.execSync
  try {
    process.execSync(
      `cd static/${repoName}/dist &&
       git init &&
       git remote add origin ${repoUrl} &&
       git add -A &&
       git commit -m 'deploy' &&
       git push -f ${repoUrl} master:gh-pages &&
       cd -`
    )
  }  catch (e) {
    console.log(e);
  } finally {
    process.exec(`cd static && rm -rf ${repoName}`);
  }
}

async function renderTpl({templateGit, name: repoName, data, repoUrl, templateConfig}) {
  if (!(await utils.existOrNot('./static'))) {
    await utils.mkdirFolder('static');
  }

  // 基础模版所在目录，如果是初始化，则是模板名称，否则是项目名称
  const temp_dest = `static/${templateConfig.templateName || repoName}`;

  // 下载模板
  if (!(await utils.existOrNot(temp_dest))) {
    await downloadFunc(templateConfig.git || repoUrl, temp_dest);
  }

  // 注入数据
  const res = fs.readFileSync(`${temp_dest}/dist/index.html`, 'utf-8');
  let target = res.replace(
    /(<script data-inject>)[\s|\S]*?(<\/script>)/,
    `
    <script data-inject="true">
    window.__coco_config__= ${JSON.stringify({
      ...data,
      components: data.userSelectComponents
    })}
    </script>\n
    `
  );

  target = target.replace(/(<title>)[\s|\S]*?(<\/title>)/, `<title>${data.config.projectName}</title>`);

  fs.writeFileSync(`${temp_dest}/dist/index.html`, target);

  // 还有发布到 git project gh-page branch
  await release(repoUrl, templateConfig.templateName || repoName);

  return Promise.resolve({});
}

class ProjectService extends Service {
  constructor(props) {
    super(props)
    this.octokit = new Octokit({ auth: this.config.github.token });
  }
  async createProject(config) {
    // todo 判断是否已经存在项目，存在则不创建
    // coco-h5 替换成创建的 organizations name
    const {data: {id, ssh_url}} = await this.octokit.request(`POST /orgs/${this.config.github.org}/repos`, {
      org: this.config.github.org,
      name: config.name
    });

    await renderTpl({
      ...config,
      repoUrl: ssh_url
    });
    return {id, ssh_url}
  }

}

module.exports = ProjectService;
