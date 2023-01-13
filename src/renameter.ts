import { MarkdownView, App, FileSystemAdapter } from "obsidian";
import { PluginSettings } from "./setting";
import { resolve, parse, join, delimiter, sep } from "path";
import * as moment from 'moment';
import { arrayToObject, escapeRegExp, isEmpty, prefixZero, resolveRule } from "./utils";
import { existsSync, mkdirSync } from "fs";


export default class Renameter {
  app: App;
  settings: PluginSettings;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  async generateNewName(filePath: string, attachmentFolderPath: string) {
    const curFileTitle = this.app.workspace.getActiveFile().basename;
    if (!curFileTitle || curFileTitle.startsWith("未命名") || curFileTitle.startsWith("Untitled")) {
      throw new Error("当前文件未命名（未命名|Untitled），请在命名后重新执行");
    }

    if (isEmpty(this.settings.autoRenameRule)) {
      throw new Error("无效的文件名规则");
    }

    const resolvedRule = resolveRule(this.settings.autoRenameRule, curFileTitle);
    const arrRule = resolvedRule.split("/");
    const imgName = arrRule.pop();
    
    const newImgFolderPath = join.apply(null, [attachmentFolderPath].concat(arrRule));
    if (!existsSync(newImgFolderPath)) {
      mkdirSync(newImgFolderPath, { recursive: true });
    }

    const oldFilePathInfo = parse(filePath);

    // 新图片完整名称
    const newImgFullName = `${imgName}${oldFilePathInfo.ext}`;
    const newImgPath = join(newImgFolderPath, newImgFullName);

    // 旧路径（去掉编号）与新地址一致，不进行重命名操作
    // if (new RegExp(`^(?<name>${imgNameEscaped})-(?<number>\\d+)\\..+$`).exec(oldFilePathInfo.base)) {
    const oldImgPath = join(oldFilePathInfo.dir, oldFilePathInfo.base).replaceAll(/-\d+\.\w+$/g, oldFilePathInfo.ext);
    if (oldImgPath == newImgPath) {
      return {
        folderPath: oldFilePathInfo.dir,
        imgName: oldFilePathInfo.name,
        imgExt: oldFilePathInfo.ext,
        imgFullName: oldFilePathInfo.base,
        imgPath: filePath
      };
    } else {
      // 为新路径添加后缀编号，并返回
      var newImgInfo = await this.deduplicateNewName(newImgPath, attachmentFolderPath);
      if (existsSync(filePath)) {
        await this.renameFile(filePath, newImgInfo.imgPath);
      }
      return newImgInfo;
    }
  }

  async deduplicateNewName(filePath: string, attachmentFolderPath: string) {
    const filePathInfo = parse(filePath);
    const imgFolderPath = filePathInfo.dir;
    const imgFullName = filePathInfo.base;
    const imgNameEscaped = escapeRegExp(filePathInfo.name);
    const imgExt = filePathInfo.ext;

    // @ts-ignore
    const parentFolder = join(this.app.vault.config.attachmentFolderPath, imgFolderPath.replace(attachmentFolderPath, ""));
    const listed = await this.app.vault.adapter.list(parentFolder);
    const dupNameRegex = new RegExp(
      `^(?<name>${imgNameEscaped})(?<suffix>-(?<number>\\d+))?\\..+$`);

    const dupNameNumbers: number[] = [];
    let isNewNameExist = false;
    for (let file of listed.files) {
      const listItemFullName = parse(file).base;
      // if (listItemFullName == imgFullName) {
      //   isNewNameExist = true;
      //   continue;
      // }

      // match dupNames
      const m = dupNameRegex.exec(listItemFullName);
      if (!m) { 
        continue;
      }
      // parse int for m.groups.number 
      dupNameNumbers.push(parseInt(m.groups.number || "0"));
    }

    const newNumber = dupNameNumbers.length > 0 ? Math.max.apply(null, dupNameNumbers) + 1 : null;
    const newNumberStr = newNumber != null ? prefixZero(newNumber, 2) : "";
    
    const newImgName = newNumberStr ? `${imgNameEscaped}-${newNumberStr}` : imgNameEscaped;
    const newImgFullName = `${newImgName}${imgExt}`;
    const newImgPath = join(imgFolderPath, `${newImgFullName}`);
    
    return {
      folderPath: imgFolderPath,
      imgName: newImgName,
      imgExt: imgExt,
      imgFullName: newImgFullName,
      imgPath: newImgPath
    };
  }

  async renameFile(oldFilePath: string, newFilePath: string) {
    const basePath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    const oldFileVaultPath = oldFilePath.replace(join(basePath, sep), "").replaceAll(/\\/g, "/");
    const fileMap = arrayToObject(this.app.vault.getFiles(), "path");
    const oldFile = fileMap[oldFileVaultPath];

    if (!oldFile) {
      return;
    }

    const newFileVaultPath = newFilePath.replace(join(basePath, sep), "").replaceAll(/\\/g, "/");
    await this.app.fileManager.renameFile(oldFile, newFileVaultPath);
  }
}
