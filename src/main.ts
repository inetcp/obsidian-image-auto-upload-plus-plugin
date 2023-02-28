import {
  MarkdownView,
  Plugin,
  FileSystemAdapter,
  Editor,
  Menu,
  MenuItem,
  TFile,
  normalizePath,
  Notice,
  addIcon,
  requestUrl,
} from "obsidian";

import { resolve, relative, join, parse, posix, basename, dirname, sep } from "path";
import { existsSync, mkdirSync, writeFileSync, unlink, readdirSync, rmdirSync, rmSync } from "fs";

import fixPath from "fix-path";

import {
  isAssetTypeAnImage,
  isAnImage,
  getUrlAsset,
  arrayToObject,
  uniqueId,
} from "./utils";
import { PicGoUploader, PicGoCoreUploader } from "./uploader";
import Helper from "./helper";

import { SettingTab, PluginSettings, DEFAULT_SETTINGS } from "./setting";
import Renameter from "./renameter";

interface Image {
  path: string;
  name: string;
  source: string;
}

export default class imageAutoUploadPlugin extends Plugin {
  settings: PluginSettings;
  helper: Helper;
  editor: Editor;
  picGoUploader: PicGoUploader;
  picGoCoreUploader: PicGoCoreUploader;
  uploader: PicGoUploader | PicGoCoreUploader;
  renameter: Renameter;

  async loadSettings() {
    this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {}

  async onload() {
    await this.loadSettings();

    this.helper = new Helper(this.app);
    this.picGoUploader = new PicGoUploader(this.settings);
    this.picGoCoreUploader = new PicGoCoreUploader(this.settings);
    this.renameter = new Renameter(this.app, this.settings);

    if (this.settings.uploader === "PicGo") {
      this.uploader = this.picGoUploader;
    } else if (this.settings.uploader === "PicGo-Core") {
      this.uploader = this.picGoCoreUploader;
      if (this.settings.fixPath) {
        fixPath();
      }
    } else {
      new Notice("unknown uploader");
    }

    addIcon(
      "upload",
      `<svg t="1636630783429" class="icon" viewBox="0 0 100 100" version="1.1" p-id="4649" xmlns="http://www.w3.org/2000/svg">
      <path d="M 71.638 35.336 L 79.408 35.336 C 83.7 35.336 87.178 38.662 87.178 42.765 L 87.178 84.864 C 87.178 88.969 83.7 92.295 79.408 92.295 L 17.249 92.295 C 12.957 92.295 9.479 88.969 9.479 84.864 L 9.479 42.765 C 9.479 38.662 12.957 35.336 17.249 35.336 L 25.019 35.336 L 25.019 42.765 L 17.249 42.765 L 17.249 84.864 L 79.408 84.864 L 79.408 42.765 L 71.638 42.765 L 71.638 35.336 Z M 49.014 10.179 L 67.326 27.688 L 61.835 32.942 L 52.849 24.352 L 52.849 59.731 L 45.078 59.731 L 45.078 24.455 L 36.194 32.947 L 30.702 27.692 L 49.012 10.181 Z" p-id="4650" fill="#8a8a8a"></path>
    </svg>`
    );

    this.addSettingTab(new SettingTab(this.app, this));

    this.addCommand({
      id: "Upload all images",
      name: "Upload all images",
      checkCallback: (checking: boolean) => {
        let leaf = this.app.workspace.activeLeaf;
        if (leaf) {
          if (!checking) {
            this.uploadAllFile();
          }
          return true;
        }
        return false;
      },
    });
    this.addCommand({
      id: "Download all images",
      name: "Download all images",
      checkCallback: (checking: boolean) => {
        let leaf = this.app.workspace.activeLeaf;
        if (leaf) {
          if (!checking) {
            this.downloadAllImageFiles();
          }
          return true;
        }
        return false;
      },
    });

    this.setupPasteHandler();
    // this.registerFileMenu();
    this.registerEditorMenu();
  }

  async downloadAllImageFiles() {
    const folderPath = this.getFileAssetPath();
    const fileArray = this.helper.getAllFiles();
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath);
    }

    let imageArray = [];
    for (const file of fileArray) {
      if (!file.path.startsWith("http")) {
        continue;
      }

      const url = file.path;
      const asset = getUrlAsset(url);
      if (!isAnImage(asset.substr(asset.lastIndexOf(".")))) {
        if (!(await this.isImageByImgLoad(url))) {
          continue;
        }
      }
      let [name, ext] = [
        decodeURI(parse(asset).name).replaceAll(/[\\\\/:*?\"<>|]/g, "-"),
        parse(asset).ext,
      ];
      // 如果文件名已存在，则用随机值替换
      if (existsSync(join(folderPath, encodeURI(asset)))) {
        name = uniqueId();
      }
      name = `image-${name}`;

      const imageItem = await this.renameAndDownload({
        path: file.path,
        name: name,
        source: file.source
      });

      if (imageItem != null) {
        name = imageItem.name;
        const activeFolder = this.app.vault.getAbstractFileByPath(
          this.app.workspace.getActiveFile().path
        ).parent.path;

        const basePath = (
          this.app.vault.adapter as FileSystemAdapter
        ).getBasePath();
        const abstractActiveFolder = resolve(basePath, activeFolder);

        imageArray.push({
          source: file.source,
          name: name,
          path: normalizePath(relative(abstractActiveFolder, imageItem.path)),
        });
      }
    }

    let value = this.helper.getValue();
    imageArray.map(image => {
      value = value.replace(
        image.source,
        `![${image.name}](${encodeURI(image.path)})`
      );
    });

    this.helper.setValue(value);

    new Notice(
      `all: ${fileArray.length}\nsuccess: ${imageArray.length}\nfailed: ${
        fileArray.length - imageArray.length
      }`
    );
  }

  // 获取当前文件所属的附件文件夹
  getFileAssetPath() {
    const basePath = (
      this.app.vault.adapter as FileSystemAdapter
    ).getBasePath();

    // @ts-ignore
    const assetFolder: string = this.app.vault.config.attachmentFolderPath;
    const activeFile = this.app.vault.getAbstractFileByPath(
      this.app.workspace.getActiveFile().path
    );

    // 当前文件夹下的子文件夹
    if (assetFolder.startsWith("./")) {
      const activeFolder = decodeURI(resolve(basePath, activeFile.parent.path));
      return join(activeFolder, assetFolder);
    } else {
      // 根文件夹
      return join(basePath, assetFolder);
    }
  }

  async download(url: string, path: string) {
    const response = await requestUrl({ url });

    if (response.status !== 200) {
      return {
        ok: false,
        msg: "error：" + response.status,
      };
    }
    const buffer = Buffer.from(response.arrayBuffer);

    try {
      writeFileSync(path, buffer);
      return {
        ok: true,
        msg: "ok",
        path: path,
      };
    } catch (err) {
      console.error(err);

      return {
        ok: false,
        msg: err,
      };
    }
  }

  registerFileMenu() {
    this.registerEvent(
      this.app.workspace.on(
        "file-menu",
        (menu: Menu, file: TFile, source: string) => {
          if (!isAssetTypeAnImage(file.path)) {
            return false;
          }
          menu.addItem((item: MenuItem) => {
            item
              .setTitle("Upload")
              .setIcon("upload")
              .onClick(() => {
                if (!(file instanceof TFile)) {
                  return false;
                }
                this.fileMenuUpload(file);
              });
          });
        }
      )
    );
  }

  fileMenuUpload(file: TFile) {
    let content = this.helper.getValue();

    const basePath = (
      this.app.vault.adapter as FileSystemAdapter
    ).getBasePath();
    let imageList: Image[] = [];
    const fileArray = this.helper.getAllFiles();

    for (const match of fileArray) {
      const imageName = match.name;
      const encodedUri = match.path;

      const fileName = basename(decodeURI(encodedUri));

      if (file && file.name === fileName) {
        const abstractImageFile = join(basePath, file.path);

        if (isAssetTypeAnImage(abstractImageFile)) {
          imageList.push({
            path: abstractImageFile,
            name: imageName,
            source: match.source,
          });
        }
      }
    }

    if (imageList.length === 0) {
      new Notice("没有解析到图像文件");
      return;
    }

    this.uploader.uploadFiles(imageList.map(item => item.path)).then(res => {
      if (res.success) {
        let uploadUrlList = res.result;
        imageList.map(item => {
          const uploadImage = uploadUrlList.shift();
          content = content.replaceAll(
            item.source,
            `![${item.name}](${uploadImage})`
          );
        });
        this.helper.setValue(content);
        // if (this.settings.deleteSource) {
        //   imageList.map(image => {
        //     if (!image.path.startsWith("http")) {
        //       unlink(image.path, () => {});
        //     }
        //   });
        // }

        this.delLocalImage(imageList);
      } else {
        new Notice("Upload error");
      }
    });
  }

  filterFile(fileArray: Image[]) {
    const imageList: Image[] = [];

    for (const match of fileArray) {
      if (match.path.startsWith("http")) {
        if (
          !this.helper.hasBlackDomain(
            match.path,
            this.settings.newWorkBlackDomains
          )
          && this.settings.workOnNetWork
        ) {
          imageList.push({
            path: match.path,
            name: match.name,
            source: match.source,
          });
        }
      } else {
        imageList.push({
          path: match.path,
          name: match.name,
          source: match.source,
        });
      }
    }

    return imageList;
  }
  getFile(fileName: string, fileMap: any) {
    if (!fileMap) {
      fileMap = arrayToObject(this.app.vault.getFiles(), "name");
    }
    return fileMap[fileName];
  }
  // uploda all file
  async uploadAllFile() {
    let content = this.helper.getValue();

    const basePath = (
      this.app.vault.adapter as FileSystemAdapter
    ).getBasePath();
    const activeFile = this.app.workspace.getActiveFile();
    const fileMap = arrayToObject(this.app.vault.getFiles(), "name");
    const filePathMap = arrayToObject(this.app.vault.getFiles(), "path");
    let imageList: Image[] = [];
    const fileArray = this.filterFile(this.helper.getAllFiles());

    for (const match of fileArray) {
      const imageName = match.name;
      const encodedUri = match.path;

      if (encodedUri.startsWith("http")) {
        imageList.push({
          path: match.path,
          name: imageName,
          source: match.source,
        });
      } else {
        const fileName = basename(decodeURI(encodedUri));
        let file;
        // 绝对路径
        if (filePathMap[decodeURI(encodedUri)]) {
          file = filePathMap[decodeURI(encodedUri)];
        }

        // 相对路径
        if (
          (!file && decodeURI(encodedUri).startsWith("./")) ||
          decodeURI(encodedUri).startsWith("../")
        ) {
          const filePath = resolve(
            join(basePath, dirname(activeFile.path)),
            decodeURI(encodedUri)
          );

          if (existsSync(filePath)) {
            const path = normalizePath(
              relative(
                basePath,
                resolve(
                  join(basePath, dirname(activeFile.path)),
                  decodeURI(encodedUri)
                )
              )
            );

            file = filePathMap[path];
          }
        }
        // 尽可能短路径
        if (!file) {
          file = this.getFile(fileName, fileMap);
        }

        if (file) {
          const abstractImageFile = join(basePath, file.path);

          if (isAssetTypeAnImage(abstractImageFile)) {
            imageList.push({
              path: abstractImageFile,
              name: imageName,
              source: match.source,
            });
          }
        }
      }
    }

    imageList = await this.batchRenameAndDownload(imageList);

    if (imageList.length === 0) {
      new Notice("没有解析到图像文件");
      return;
    } else {
      new Notice(`共找到${imageList.length}个图像文件，开始上传`);
    }

    this.uploadFilesByImageList(imageList, content, (content: string) => {
      this.helper.setValue(content);
    });
  }

  setupPasteHandler() {
    this.registerEvent(
      this.app.workspace.on(
        "editor-paste",
        async (evt: ClipboardEvent, editor: Editor, markdownView: MarkdownView) => {
          const allowUpload = this.helper.getFrontmatterValue(
            "image-auto-upload",
            this.settings.uploadByClipSwitch
          );

          let files = evt.clipboardData.files;
          if (!allowUpload) {
            return;
          }
          // 剪贴板内容有md格式的图片时
          if (this.settings.pasteMarkdownUpload) {
            const clipboardValue = evt.clipboardData.getData("text/plain");
            let imageList = this.helper
              .getImageLink(clipboardValue)
              .filter(image => image.path.startsWith("http"))
              .filter(
                image =>
                  !this.helper.hasBlackDomain(
                    image.path,
                    this.settings.newWorkBlackDomains
                  )
              );

            imageList = await this.batchRenameAndDownload(imageList);

            if (imageList.length !== 0) {
              this.uploader
                .uploadFiles(imageList.map(item => item.path))
                .then(res => {
                  let value = this.helper.getValue();
                  if (res.success) {
                    let uploadUrlList = res.result;
                    imageList.map(item => {
                      const uploadImage = uploadUrlList.shift();
                      value = value.replaceAll(
                        item.source,
                        `![${item.name}](${uploadImage})`
                      );
                    });
                    this.helper.setValue(value);
                    this.delLocalImage(imageList);
                  } else {
                    new Notice("Upload error");
                  }
                });
            }
          }

          // 剪贴板中是图片时进行上传
          if (this.canUpload(evt.clipboardData)) {
            // this.uploadFileAndEmbedImgurImage(
            this.uploadFileByClipboard(  
              editor,
              async (editor: Editor, pasteId: string) => {
                let res = await this.uploader.uploadFileByClipboard();
                if (res.code !== 0) {
                  this.handleFailedUpload(editor, pasteId, res.msg);
                  return;
                }
                const url = res.data;
                return url;
              },
              evt.clipboardData
            ).catch();
            evt.preventDefault();
          }
        }
      )
    );
    this.registerEvent(
      this.app.workspace.on(
        "editor-drop",
        async (evt: DragEvent, editor: Editor, markdownView: MarkdownView) => {
          const allowUpload = this.helper.getFrontmatterValue(
            "image-auto-upload",
            this.settings.uploadByClipSwitch
          );
          let files = evt.dataTransfer.files;

          if (!allowUpload) {
            return;
          }

          if (files.length !== 0 && files[0].type.startsWith("image")) {
            let sendFiles: Array<String> = [];
            let files = evt.dataTransfer.files;
            Array.from(files).forEach((item, index) => {
              sendFiles.push(item.path);
            });
            evt.preventDefault();

            const data = await this.uploader.uploadFiles(sendFiles);

            if (data.success) {
              data.result.map((value: string) => {
                let pasteId = (Math.random() + 1).toString(36).substr(2, 5);
                this.insertTemporaryText(editor, pasteId);
                this.embedMarkDownImage(editor, pasteId, value, files[0].name);
              });
            } else {
              new Notice("Upload error");
            }
          }
        }
      )
    );
  }

  canUpload(clipboardData: DataTransfer) {
    this.settings.applyImage;
    const files = clipboardData.files;
    const text = clipboardData.getData("text");

    const hasImageFile =
      files.length !== 0 && files[0].type.startsWith("image");
    if (hasImageFile) {
      if (!!text) {
        return this.settings.applyImage;
      } else {
        return true;
      }
    } else {
      return false;
    }
  }

  async uploadFileAndEmbedImgurImage(
    editor: Editor,
    callback: Function,
    clipboardData: DataTransfer
  ) {
    let pasteId = (Math.random() + 1).toString(36).substr(2, 5);
    this.insertTemporaryText(editor, pasteId);
    const name = clipboardData.files[0].name;
    try {
      const url = await callback(editor, pasteId);
      this.embedMarkDownImage(editor, pasteId, url, name);
    } catch (e) {
      this.handleFailedUpload(editor, pasteId, e);
    }
  }

  insertTemporaryText(editor: Editor, pasteId: string) {
    let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
    editor.replaceSelection(progressText + "\n");
  }

  private static progressTextFor(id: string) {
    return `![Uploading file...${id}]()`;
  }

  embedMarkDownImage(
    editor: Editor,
    pasteId: string,
    imageUrl: any,
    name: string = ""
  ) {
    let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
    let markDownImage = `![${name}](${imageUrl})`;

    imageAutoUploadPlugin.replaceFirstOccurrence(
      editor,
      progressText,
      markDownImage
    );
  }

  handleFailedUpload(editor: Editor, pasteId: string, reason: any) {
    console.error("Failed request: ", reason);
    let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
    imageAutoUploadPlugin.replaceFirstOccurrence(
      editor,
      progressText,
      "⚠️upload failed, check dev console"
    );
  }

  static replaceFirstOccurrence(
    editor: Editor,
    target: string,
    replacement: string
  ) {
    let lines = editor.getValue().split("\n");
    for (let i = 0; i < lines.length; i++) {
      let ch = lines[i].indexOf(target);
      if (ch != -1) {
        let from = { line: i, ch: ch };
        let to = { line: i, ch: ch + target.length };
        editor.replaceRange(replacement, from, to);
        break;
      }
    }
  }


/* ======================== 自定义部分 ======================== */

  isImageByImgLoad(imgUrl: string) {
    let img = document.createElement("img");
    img.src = imgUrl;
    return new Promise(function(resolve, reject) {
      img.onerror = () => {
        resolve(false);
      };
      img.onload = () => {
        resolve(true);
      };
    });
  }

  /**
   * 注册编辑器右键菜单，只有当前行包含图片链接，才显示“Upload”菜单
   */
  registerEditorMenu() {
    this.registerEvent(
      this.app.workspace.on(
        "editor-menu",
        (menu: Menu, editor: Editor, view: MarkdownView) => {
          const curLine = editor.getCursor().line;
          let lineContent = editor.getLine(curLine);
          const imageList = this.helper.getImageLink(lineContent);

          if (!imageList || imageList.length == 0) {
            return false;
          }

          const hasImage = imageList.some(async image => {
            if (image.path.startsWith("http")) {
              const asset = getUrlAsset(image.path);
              const isImage = isAnImage(asset.substr(asset.lastIndexOf(".")));
              if (!isImage) {
                return await this.isImageByImgLoad(image.path);
              }
              return true;
            } else {
              return isAssetTypeAnImage(image.path);
            }
          });
          if (!hasImage) {
            return false;
          }
          
          menu.addItem((item: MenuItem) => {
            item
              .setTitle("上传图片到图床")
              .setIcon("upload")
              .onClick(async () => {
                const newImageList = await this.batchRenameAndDownload(imageList);
                this.uploadFilesByImageList(newImageList, lineContent, (content: string) => {
                  editor.setLine(curLine, content);
                });
              });
          });
        }
      )
    );
  }

  /**
   * 重命名图片文件并下载
   * @param image 
   * @returns 
   */
  async renameAndDownload(image: Image) {
    const imageListResult = await this.batchRenameAndDownload([image]);
    return imageListResult != null && imageListResult.length > 0 ? imageListResult[0] : null;
  }

  /**
   * 批量重命名图片文件并下载
   * @param imageList 
   * @returns 
   */
  async batchRenameAndDownload(imageList: Image[]) {
    const newImageList: Image[] = [];
    try {
      const attachmentFolderPath = this.getFileAssetPath();
      for (const image of imageList) {
        let newImgInfo: any;
        if (image.path.startsWith("http")) {
          const asset = getUrlAsset(image.path);
          if (!isAnImage(asset.substr(asset.lastIndexOf(".")))) {
            if (!(await this.isImageByImgLoad(image.path))) {
              continue;
            }
          }

          const fileName = image.name || 'image';
          const fileExt = parse(asset).ext || ".png";
          const filePath = join(attachmentFolderPath, `${fileName}${fileExt}`);
          newImgInfo = await this.renameter.generateNewName(filePath, attachmentFolderPath);
          const response = await this.download(image.path, newImgInfo.imgPath);
          if (!response.ok) {
            throw new Error("下载图片异常");
          }
        } else {
          newImgInfo = await this.renameter.generateNewName(image.path, attachmentFolderPath);
        }

        newImageList.push({
          path: newImgInfo.imgPath,
          name: newImgInfo.imgName,
          source: image.source
        });
      }
    } catch(err) {
      console.error(err);
      new Notice(`重命名并下载文件异常：${err.message}`);
    }

    return newImageList;
  }

  async uploadFilesByImageList(imageList: Image[], content: string, callback: Function) {
    if (imageList.length == 0) {
      return;
    }

    const pageSize = this.settings.simultaneousUploadNumber;
    const pageCount = Math.ceil(imageList.length / pageSize);
    new Notice(`${imageList.length}张图片将分${pageCount}批进行上传...`);
    for(let currentPage = 1; currentPage <= pageCount; currentPage++) {
      const skipNum = (currentPage - 1) * pageSize;
      const pagedImageList = (skipNum + pageSize >= imageList.length)
        ? imageList.slice(skipNum, imageList.length)
        : imageList.slice(skipNum, skipNum + pageSize);
      const pageStart = skipNum + 1;
      const pageEnd = skipNum + pagedImageList.length;

      const res = await this.uploader.uploadFiles(pagedImageList.map(item => item.path));

      if (res.success) {
        let uploadUrlList = res.result;
        pagedImageList.map(item => {
          const uploadImage = uploadUrlList.shift();
          content = content.replaceAll(
            item.source,
            `![${item.name}](${uploadImage})`
          );
        });
        callback(content);

        // if (this.settings.deleteSource) {
        //   imageList.map(image => {
        //     if (!image.path.startsWith("http")) {
        //       unlink(image.path, () => {});
        //     }
        //   });
        // }
        this.delLocalImage(imageList);
        new Notice(`第${currentPage}批次(${pageStart}-${pageEnd})的图片已上传完毕`);
      } else {
        console.error(`第${currentPage}批次(${pageStart}-${pageEnd})的图片上传失败`, res);
        new Notice(`第${currentPage}批次(${pageStart}-${pageEnd})的图片上传失败`);
      }
    }
  }

  async saveClipboardDataToFile(clipboardData: DataTransfer) {
    const file = clipboardData.files[0];
    
    const arrBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrBuffer);

    const attachmentFolderPath = this.getFileAssetPath();
    const name = file.name;

    const newImgInfo = await this.renameter.generateNewName(name, attachmentFolderPath);
    writeFileSync(newImgInfo.imgPath, buffer);

    return newImgInfo;
  }

  async uploadFileByClipboard(
    editor: Editor,
    callback: Function,
    clipboardData: DataTransfer
  ) {
    let pasteId = uniqueId();
    this.insertTemporaryText(editor, pasteId);
    const imgInfo = await this.saveClipboardDataToFile(clipboardData);
    try {
      // const url = await callback(editor, pasteId);

      let res = await this.uploader.uploadFiles([imgInfo.imgPath]);
      if (!res.success || res.result.length == 0) {
        this.handleFailedUpload(editor, pasteId, res.msg);
        return;
      }
      const url = res.result[0];

      this.embedMarkDownImage(editor, pasteId, url, imgInfo.imgName);
      
      const imageList: Image[] = [];
      imageList.push({
        path: imgInfo.imgPath,
        name: imgInfo.imgName,
        source: null
      });
      this.delLocalImage(imageList);
    } catch (e) {
      this.handleFailedUpload(editor, pasteId, e);
    }
  }

  delLocalImage(imageList: Image[]) {
    if (!this.settings.deleteSource) {
      return;
    }

    const attachmentFolderPath = this.getFileAssetPath();
    imageList.forEach(image => {
      if (!image.path.startsWith("http")) {
        rmSync(image.path, { force: true });

        var parentFolder = parse(image.path).dir;
        while (parentFolder != attachmentFolderPath && readdirSync(parentFolder).length === 0) {
          rmdirSync(parentFolder);
          const arrParentFolder = parentFolder.split(sep);
          arrParentFolder.pop();

          parentFolder = join.apply(null, arrParentFolder);
        }
      }
    });
  }
}
