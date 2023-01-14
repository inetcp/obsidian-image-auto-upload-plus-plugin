import { App, PluginSettingTab, Setting } from "obsidian";
import imageAutoUploadPlugin from "./main";
import { t } from "./lang/helpers";
import { getOS } from "./utils";

export interface PluginSettings {
  uploadByClipSwitch: boolean;
  uploadServer: string;
  uploader: string;
  picgoCorePath: string;
  workOnNetWork: boolean;
  newWorkBlackDomains: string;
  fixPath: boolean;
  applyImage: boolean;
  deleteSource: boolean;
  pasteMarkdownUpload: boolean;
  autoRenameRule: string;
  simultaneousUploadNumber: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  uploadByClipSwitch: true,
  uploader: "PicGo",
  uploadServer: "http://127.0.0.1:36677/upload",
  picgoCorePath: "",
  workOnNetWork: false,
  fixPath: false,
  applyImage: true,
  pasteMarkdownUpload: false,
  autoRenameRule: "{{date:YYYY}}/{{date:MM}}/{{date:DD}}/{{title}}",
  newWorkBlackDomains: "",
  deleteSource: false,
  simultaneousUploadNumber: 5
};

export class SettingTab extends PluginSettingTab {
  plugin: imageAutoUploadPlugin;

  constructor(app: App, plugin: imageAutoUploadPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    const os = getOS();

    containerEl.empty();
    containerEl.createEl("h2", { text: t("Plugin Settings") });
    new Setting(containerEl)
      .setName(t("Auto pasted upload"))
      .setDesc(
        t(
          "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)"
        )
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.uploadByClipSwitch)
          .onChange(async value => {
            this.plugin.settings.uploadByClipSwitch = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("Default uploader"))
      .setDesc(t("Default uploader"))
      .addDropdown(cb =>
        cb
          .addOption("PicGo", "PicGo(app)")
          .addOption("PicGo-Core", "PicGo-Core")
          .setValue(this.plugin.settings.uploader)
          .onChange(async value => {
            this.plugin.settings.uploader = value;
            this.display();
            await this.plugin.saveSettings();
          })
      );

    if (this.plugin.settings.uploader === "PicGo") {
      new Setting(containerEl)
        .setName(t("PicGo server"))
        .setDesc(t("PicGo server"))
        .addText(text =>
          text
            .setPlaceholder(t("Please input PicGo server"))
            .setValue(this.plugin.settings.uploadServer)
            .onChange(async key => {
              this.plugin.settings.uploadServer = key;
              await this.plugin.saveSettings();
            })
        );
    }

    if (this.plugin.settings.uploader === "PicGo-Core") {
      new Setting(containerEl)
        .setName(t("PicGo-Core path"))
        .setDesc(
          t("Please input PicGo-Core path, default using environment variables")
        )
        .addText(text =>
          text
            .setPlaceholder("")
            .setValue(this.plugin.settings.picgoCorePath)
            .onChange(async value => {
              this.plugin.settings.picgoCorePath = value;
              await this.plugin.saveSettings();
            })
        );

      if (os !== "Windows") {
        new Setting(containerEl)
          .setName(t("fixPath"))
          .setDesc(t("fixPathWarning"))
          .addToggle(toggle =>
            toggle
              .setValue(this.plugin.settings.fixPath)
              .onChange(async value => {
                this.plugin.settings.fixPath = value;
                await this.plugin.saveSettings();
              })
          );
      }
    }

    new Setting(containerEl)
      .setName(t("Work on network"))
      .setDesc(t("Work on network Description"))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.workOnNetWork)
          .onChange(async value => {
            this.plugin.settings.workOnNetWork = value;
            this.display();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("Network Domain Black List"))
      .setDesc(t("Network Domain Black List Description"))
      .addTextArea(textArea =>
        textArea
          .setValue(this.plugin.settings.newWorkBlackDomains)
          .onChange(async value => {
            this.plugin.settings.newWorkBlackDomains = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("Upload when clipboard has image and text together"))
      .setDesc(
        t(
          "When you copy, some application like Excel will image and text to clipboard, you can upload or not."
        )
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.applyImage)
          .onChange(async value => {
            this.plugin.settings.applyImage = value;
            this.display();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("Delete source file after you upload file"))
      .setDesc(t("Delete source file in ob assets after you upload file."))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.deleteSource)
          .onChange(async value => {
            this.plugin.settings.deleteSource = value;
            this.display();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("🛠 粘贴Markdown文本自动上传")
      .setDesc("Markdown文本中包含图片链接时，粘贴时自动上传图床")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.pasteMarkdownUpload)
          .onChange(async value => {
            this.plugin.settings.pasteMarkdownUpload = value;
            this.display();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("🛠 图片命名规则")
      .setDesc(this.multiDesc(
`用于下载图片或上传到图床前，生成图片的命名规则。会根据预设的规则重新命名图片（包含路径）。

可用的变量占位符：
- {{title}}：当前文档的标题
- {{timestamp}}：时间戳
- {{uniqueid}}: 唯一流水号
- {{date:$FORMAT}}：Moment.js 的日期 format 字符串，例：{{date:YYYYMMDD}}

此规则可以定义对应层级的目录，例如“img/{{date:YYYY}}/{{date:MM}}/{{date:DD}}/{{title}}”规则就是每天生成一个目录，以文件名作为图片名的前缀，以图片在文档中的序号作为后缀来生成图片名，输出“img/2023/01/01/图片自动上传实现-01.png”
`))
      .addText(text =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.autoRenameRule)
          .onChange(async value => {
            this.plugin.settings.autoRenameRule = value;
            await this.plugin.saveSettings();
          })
      );

      new Setting(containerEl)
      .setName("🛠 同时上传图片数量")
      .setDesc("批量上传时，同时上传的最大数量，超过这个数量将拆分多个批次上传")
      .addText(toggle =>
        toggle
          .setValue(this.plugin.settings.simultaneousUploadNumber.toString())
          .onChange(async value => {
            this.plugin.settings.simultaneousUploadNumber = value ? parseInt(value) : 0;
            this.display();
            await this.plugin.saveSettings();
          })
      );
  }

  multiDesc(desc: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const arrDesc = desc.split("\n");
    arrDesc.forEach(descItem => {
      if (descItem) {
        const div = document.createElement("div");
        div.innerHTML = descItem;
        frag.appendChild(div);
      } else {
        const br = document.createElement("br");
        frag.appendChild(br);
      }

    });

    return frag;
  }
}
