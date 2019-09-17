﻿const fs = require('fs');
const path = require('path');
const fsUtil = require('./fsUtil');

let ResType = {
    Image: 0, // 普通图片
    ImageAtlas: 1, // 大图
    LabelAtlas: 2, // 艺术数字
    Anim: 3, // 动画文件
    Spine: 4, // Spine
    Prefab: 5, // prefab
    Fire: 6, // 场景文件 
};

let ResExt = [
    { name:'.plist', type:ResType.ImageAtlas },
    { name:'.labelatlas', type:ResType.LabelAtlas },
    { name:'.json', type:ResType.Spine },
];

let MainRun = {
    sourceFile: process.argv[2],
    destFile: process.argv[3],
    sourceMap: null,
    destMap: null,

    start() {
        this.sourceMap = new Map();
        this.destMap = new Map();
        this.handleMap = new Map();

        // 非绝对路径则加上当前目录
        if (!path.isAbsolute(this.sourceFile)) {
            this.sourceFile = path.join(__dirname, this.sourceFile);
        }
        if (!path.isAbsolute(this.destFile)) {
            this.destFile = path.join(__dirname, this.destFile);
        }

        this.traversalDir(this.sourceFile);
        
        let content = this.compareRes();

        fsUtil.writeFile(this.destFile, content);
    },

    // UUID和文件逐个比较，如果未找到，则说明该UUID对应的文件未被引用
    compareRes() {
        let outStr = '未引用文件：\n';

        for (let [srcPath, srcData] of this.sourceMap.entries()) {
            let bFound = false;
            for (let [destPath, destData] of this.destMap.entries()) {
                if (srcPath == destPath) {
                    continue;
                }
                if (!!srcData && !!srcData.uuid) {
                    for (let i = 0, len = srcData.uuid.length; i < len; i++) {
                        let uuid = srcData.uuid[i];
                        if (destData.data.indexOf(uuid) >= 0) {
                            bFound = true;
                            break; // 源数组只要有一个UUID被引用，即代表源文件被引用了，无需继续查找
                        }
                    }
                }
                if (bFound) {
                    break; // 源文件只要被一个目标文件引用，即代表源文件被引用了，无需再和之后的目标文件比较
                }
            }

            srcData.refed = bFound;
            if (!bFound) {
                outStr += 'path=' +srcPath +'\n'; 
            }
        }

        return outStr;
    },

    traversalDir(srcDir, callback) {
        if (!srcDir || !fs.existsSync(srcDir)) {    
            console.error("invalid srcDir=" + srcDir);
            return;
        }

        let files = fs.readdirSync(srcDir);
        for (let i = 0, len = files.length; i < len; i++) {
            let file = files[i];
            let curPath = path.join(srcDir, file);

            // 暂时排除src目录
            if (curPath.indexOf('\\src\\') >= 0) {
                continue;
            }
            // 如果该文件已处理过则直接跳过
            if (this.handleMap.has(curPath)) {
                continue;
            }

            let stats = fs.statSync(curPath);
            if (stats.isDirectory()) {
                this.traversalDir(curPath);
                continue;
            }

            let data = null;
            let uuid = [];
            let pathObj = path.parse(curPath);
            // 针对各类型文件做相应处理
            switch (pathObj.ext) {
                case '.prefab':
                    if (curPath.indexOf('\\res\\') >= 0) {
                        uuid = this.getFileUUID(curPath, pathObj, ResType.Prefab);
                        this.sourceMap.set(curPath, { uuid });
                    }
                    data = fsUtil.getFileString(curPath);
                    this.destMap.set(curPath, { data });
                    break;

                case '.anim':
                    if (curPath.indexOf('\\res\\') >= 0) {
                        uuid = this.getFileUUID(curPath, pathObj, ResType.Anim);
                        this.sourceMap.set(curPath, { uuid });
                    }
                    data = fsUtil.getFileString(curPath);
                    this.destMap.set(curPath, { data });
                    break;

                case '.fire':
                    data = fsUtil.getFileString(curPath);
                    this.destMap.set(curPath, { data });
                    break;
                
                case '.png':
                case '.jpg':
                    if (curPath.indexOf('\\resources\\') >= 0) {
                        break;
                    }
                    let type = this.getImageType(curPath, pathObj);
                    uuid = this.getFileUUID(curPath, pathObj, type);
                    this.sourceMap.set(curPath, { uuid });
                    break;

                default:
                    break;
            }
        }
    },

    // 根据同一目录下该图片同名文件的不同扩展名来判断图片类型（.plist、.json、labelatlas）
    getImageType(srcPath, pathObj) {
        let type = ResType.Image;
        for (let i = 0, len = ResExt.length; i < len; i++) {
            let ext = ResExt[i];
            let testPath = path.join(pathObj.dir, pathObj.name) + ext.name;
            if (fs.existsSync(testPath)) {
                type = ext.type;
                this.handleMap.set(testPath, { handled:true });
                break;
            }
        }
        return type;
    },

    // 获取普通图片的UUID
    getUUIDFromMeta(metaPath, sourceName) {
        let uuid = [];
        let meta = fsUtil.getObjectFromFile(metaPath);
        if (!!meta && !!meta.subMetas) {
            let obj = meta.subMetas[sourceName];
            if (!!obj && !!obj.uuid) {
                let id = obj.uuid.substring(0);
                uuid.push(id);
            }
        }
        return uuid;
    },

    // 获取普通文件的UUID
    getRawUUIDFromMeta(metaPath) {
        let uuid = [];
        let meta = fsUtil.getObjectFromFile(metaPath);
        if (!!meta && !!meta.uuid) {
            let rawUUID = meta.uuid.substring(0);
            uuid.push(rawUUID);
        }
        return uuid;
    },

    // 从Plist中获取所有碎图的uuid
    getPlistUUIDFromMeta(metaPath) {
        let uuid = [];
        let meta = fsUtil.getObjectFromFile(metaPath);
        if (!!meta && !!meta.uuid) {
            let rawUUID = meta.uuid.substring(0);
            uuid.push(rawUUID); // 记录自身ID
        }
        if (!!meta && !!meta.subMetas) {
            for (let name in meta.subMetas) {
                let obj = meta.subMetas[name];
                if (obj && obj.uuid) {
                    let id = obj.uuid.substring(0);
                    uuid.push(id); // 记录碎图ID
                }
            }
        }
        return uuid;
    },

    // 返回不同类型文件的UUID
    getFileUUID(srcPath, pathObj, type) {
        let uuid = [];
        let destPath = '';
        switch(type) {
            case ResType.Image:
                destPath = srcPath + '.meta';
                uuid = this.getUUIDFromMeta(destPath, pathObj.name);
                break;
            case ResType.ImageAtlas:
                destPath = path.join(pathObj.dir, pathObj.name) + '.plist.meta';
                uuid = this.getPlistUUIDFromMeta(destPath);
                break;
            case ResType.LabelAtlas:
                destPath = path.join(pathObj.dir, pathObj.name) + '.labelatlas.meta';
                uuid = this.getRawUUIDFromMeta(destPath);
                break;
            case ResType.Anim:
                destPath = srcPath + '.meta';
                uuid = this.getRawUUIDFromMeta(destPath, pathObj.name);
                break;
            case ResType.Spine:
                destPath = path.join(pathObj.dir, pathObj.name) + '.json.meta';
                uuid = this.getRawUUIDFromMeta(destPath);
                break;
            case ResType.Prefab:
                destPath = srcPath + '.meta';
                uuid = this.getRawUUIDFromMeta(destPath);
                break;
            default:
                break;
        }
        return uuid;
    },

};

module.exports = MainRun;

MainRun.start();
