import { resolve, extname, relative, join, parse, posix } from "path";
import { Readable } from "stream";
import { clipboard } from "electron";

export function isAnImage(ext: string) {
  return [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".svg", ".tiff", ".tif", ".ico", ".webp"].includes(
    ext.toLowerCase()
  );
}
export function isAssetTypeAnImage(path: string): Boolean {
  return (
    [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".svg", ".tiff", ".tif", ".ico", ".webp"].indexOf(
      extname(path).toLowerCase()
    ) !== -1
  );
}

export function getOS() {
  const { appVersion } = navigator;
  if (appVersion.indexOf("Win") !== -1) {
    return "Windows";
  } else if (appVersion.indexOf("Mac") !== -1) {
    return "MacOS";
  } else if (appVersion.indexOf("X11") !== -1) {
    return "Linux";
  } else {
    return "Unknown OS";
  }
}
export async function streamToString(stream: Readable) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
}

export function getUrlAsset(url: string) {
  return (url = url.substr(1 + url.lastIndexOf("/")).split("?")[0]).split(
    "#"
  )[0];
}

export function isCopyImageFile() {
  let filePath = "";
  const os = getOS();

  if (os === "Windows") {
    var rawFilePath = clipboard.read("FileNameW");
    filePath = rawFilePath.replace(new RegExp(String.fromCharCode(0), "g"), "");
  } else if (os === "MacOS") {
    filePath = clipboard.read("public.file-url").replace("file://", "");
  } else {
    filePath = "";
  }
  return isAssetTypeAnImage(filePath);
}

export function getLastImage(list: string[]) {
  const reversedList = list.reverse();
  let lastImage;
  reversedList.forEach(item => {
    if (item && item.startsWith("http")) {
      lastImage = item;
      return item;
    }
  });
  return lastImage;
}

interface AnyObj {
  [key: string]: any;
}

export function arrayToObject<T extends AnyObj>(
  arr: T[],
  key: string
): { [key: string]: T } {
  const obj: { [key: string]: T } = {};
  arr.forEach(element => {
    obj[element[key]] = element;
  });
  return obj;
}

export function escapeRegExp(s: string) {
  return s.replaceAll(/[\\\\/:*?\"<>|]/g, "-");
}

export function prefixZero(n: number, m: number) {
	return (Array(m).join("0") + n).slice(-m);
}

export function isEmpty(s: string) {
  return s === undefined || s === null || s === "";
}

export function uniqueId(): string {
  return Date.now().toString(36) + (Math.random() + 1).toString(36).substr(2, 5);
}

export function resolveRule(rule: string, title: string): string {
  const mm = window.moment();

  const resolvedText = rule
    .replaceAll(/\{\{title\}\}/g, title)
    .replaceAll(/\{\{timestamp\}\}/g, Date.now().toString())
    .replaceAll(/\{\{uniqueid\}\}/g, uniqueId())
    .replaceAll(/\{\{date:(.+?)\}\}/g, (match, $1) => {
      return mm.format($1);
    });

  return resolvedText;
}
