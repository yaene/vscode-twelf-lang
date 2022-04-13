// COPIED FROM https://marketplace.visualstudio.com/items?itemName=freebroccolo.sml
// NOTICE: possibly without copyright as the code is not under a open source license (it is closed source! 
// I extracted the code from the vscode extension market place)
// SO I am not going to publish this (or redistribute) until the author has given explicit permission
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const childProcess = require("child_process");
const events = require("events");
const fs = require("fs");
const lodash = require("lodash");
const path = require("path");
const vs = require("vscode");
class Pattern {
}
Pattern.diagnostic = /^(.+?):(\d+)\.(\d+)(?:-(\d+).(\d+))?\s(\b(?:Error)\b):\s(.*(?:\n\s+.*)*)/m;
class Session {
    constructor(context) {
        this.subscriptions = [];
        this.console = vs.window.createOutputChannel("twelf");
        this.console.appendLine("Starting Twelf Server");
        this.context = context;
        this.sml = new SML(this);
        return this;
    }
    dispose() {
        for (const item of this.subscriptions)
            item.dispose();
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sml.reload();
            this.subscriptions.push(vs.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this)));
            this.subscriptions.push(vs.workspace.onDidChangeTextDocument(this.onChangeTextDocument.bind(this)));
            this.subscriptions.push(vs.workspace.onDidSaveTextDocument(this.onDidSaveTextDocument.bind(this)));
        });
    }
    onDidChangeConfiguration() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sml.onDidChangeConfiguration();
        });
    }
    onChangeTextDocument({ document }) {
        this.console.appendLine("detected Change with language id" + document.languageId);
        return __awaiter(this, void 0, void 0, function* () {
            this.console.appendLine("detected Change with language id" + document.languageId);
            if (document.languageId === "twelf")
                yield this.sml.make(document);
        });
    }
    onDidSaveTextDocument(document) {
        this.console.write("detected Save with language id" + document.languageId);
        return __awaiter(this, void 0, void 0, function* () {
            if (document.languageId === "twelf")
                yield this.sml.makeImmediate();
        });
    }
}
class Transducer extends events.EventEmitter {
    constructor(session) {
        super();
        this.lines = [];
        this.pendingLine = "";
        this.session = session;
        return this;
    }
    dispose() {
        return;
    }
    feed(data) {
        const lines = data.toString().split(/\n(?!\s)/m);
        while (lines.length > 0) {
            this.pendingLine += lines.shift();
            if (lines.length > 0) {
                this.lines.push(this.pendingLine);
                this.pendingLine = "";
            }
        }
        if (this.pendingLine === "- ") {
            this.pendingLine = "";
            this.emit("sml/lines", this.lines);
            this.lines = [];
        }
    }
}
class SML {
    constructor(session) {
        this.prompted = false;
        this.json = null;
        this.diagnostics = vs.languages.createDiagnosticCollection("sml");
        this.subscriptions = [];
        this.session = session;
        this.transducer = new Transducer(session);
        this.watcher = vs.workspace.createFileSystemWatcher(path.join(vs.workspace.rootPath, "sml.json"));
        this.subscriptions.push(this.watcher.onDidChange(this.reload.bind(this)), this.watcher.onDidCreate(this.reload.bind(this)), this.watcher.onDidDelete(this.reload.bind(this)), this.statusItem = vs.window.createStatusBarItem(vs.StatusBarAlignment.Right, 1));
        this.onDidChangeConfiguration();
        return this;
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.disconnect();
            for (const item of this.subscriptions)
                item.dispose();
        });
    }
    makeImmediate() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.json && this.json.cm != null)
                yield this.execute(`Config.load ${this.json}`);
        });
    }
    onDidChangeConfiguration() {
        return __awaiter(this, void 0, void 0, function* () {
            const wait = vs.workspace.getConfiguration("sml").get("smlnj.make.debounce");
            if (wait != null) {
                this.make = lodash.debounce((document) => __awaiter(this, void 0, void 0, function* () {
                    yield document.save();
                }), wait, { trailing: true });
            }
            else {
                this.make = lodash.debounce(() => __awaiter(this, void 0, void 0, function* () { }));
            }
        });
    }
    reload() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.process != null)
                yield this.disconnect();
            yield this.initialize();
        });
    }
    execute(command) {
        return __awaiter(this, void 0, void 0, function* () {
            command += "\n";
            return new Promise((resolve) => {
                this.process.stdin.write(command, () => {
                    this.transducer.once("sml/lines", (response) => {
                        const rootPath = vs.workspace.rootPath;
                        const collatedDiagnostics = new Map();
                        let status = true;
                        let match = null;
                        this.diagnostics.clear();
                        for (const line of response) {
                            if ((match = line.match(Pattern.diagnostic)) == null)
                                continue;
                            match.shift();
                            const path = match.shift();
                            let uri;
                            try {
                                uri = vs.Uri.parse(`file://${rootPath}/${path}`);
                            }
                            catch (err) {
                                continue;
                            }
                            if (!collatedDiagnostics.has(uri))
                                collatedDiagnostics.set(uri, []);
                            const diagnostics = collatedDiagnostics.get(uri);
                            const startLine = parseInt(match.shift(), 10) - 1;
                            const startChar = parseInt(match.shift(), 10) - 1;
                            const endLine = parseInt(match.shift(), 10) - 1 || startLine;
                            const endChar = parseInt(match.shift(), 10) - 1 || startChar;
                            match.shift();
                            const message = match.shift();
                            const range = new vs.Range(startLine, startChar, endLine, endChar);
                            const item = new vs.Diagnostic(range, message, vs.DiagnosticSeverity.Error);
                            diagnostics.push(item);
                        }
                        this.diagnostics.set(Array.from(collatedDiagnostics.entries()));
                        resolve(status);
                    });
                });
            });
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            yield new Promise((resolve) => this.process.stdin.end(resolve));
            yield new Promise((resolve) => this.process.on("exit", resolve));
            delete this.process;
        });
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.process != null)
                return;
            if ((this.json = yield this.loadSmlJson()) == null)
                return;
           
            yield new Promise((resolve) => this.transducer.once("sml/lines", resolve));
        });
    }
    loadSmlJson() {
        return __awaiter(this, void 0, void 0, function* () {
            const cwd = vs.workspace.rootPath;
            const sourcesCfgPath = vs.workspace.getConfiguration().get("sources-config-path", "sources.cfg")
            this.statusItem.text = sourcesCfgPath;
            this.statusItem.show()
            return sourcesCfgPath;
            // let json = null;
            // try {
            //     json = yield new Promise((resolve, reject) => {
            //         fs.readFile(smlJsonPath, (err, data) => {
            //             if (err) {
            //                 reject(err);
            //             }
            //             else {
            //                 try {
            //                     resolve(JSON.parse(data.toString()));
            //                 }
            //                 catch (err) {
            //                     reject(err);
            //                 }
            //             }
            //         });
            //     });
            // }
            // catch (err) {
            //     // if (!this.prompted) {
            //     //     const sml = vs.workspace.getConfiguration("sml");
            //     //     if (!sml.get("ignoreMissingSmlDotJson")) {
            //     //         yield this.promptCreateSmlJson();
            //     //     }
            //     // }
            // }
            // if (json && json.cm && json.cm["make/onSave"]) {
            //     this.statusItem.text = `[${json.cm["make/onSave"]}]`;
            //     this.statusItem.show();
            //     return json;
            // }
            // else {
            //     this.statusItem.hide();
            //     return null;
            // }
        });
    }
    // promptCreateSmlJson() {
    //     return __awaiter(this, void 0, void 0, function* () {
    //         const cwd = vs.workspace.rootPath;
    //         yield vs.window.showWarningMessage(`Cannot find "sml.json" in "${cwd}"`);
    //         const response = yield vs.window.showInformationMessage(`Shall we create an "sml.json" file for "CM.make"?`, {
    //             title: "Create",
    //         }, {
    //             isCloseAffordance: true,
    //             title: "Ignore",
    //         });
    //         if (response == null || response.title !== "Create")
    //             return null;
    //         const cmFile = yield vs.window.showInputBox({
    //             prompt: "file:",
    //             validateInput: (input) => /\b\w+\.cm\b/.test(input) ? "" : "Input must be a cm file in root directory of project",
    //             value: "development.cm",
    //         });
    //         if (cmFile == null)
    //             return null;
    //         this.prompted = true;
    //         const data = { cm: { "make/onSave": cmFile } };
    //         yield new Promise((resolve, reject) => fs.writeFile(path.join(cwd, "sml.json"), JSON.stringify(data, null, 2), (err) => err ? reject(err) : resolve()));
    //         yield this.loadSmlJson();
    //         return cmFile;
    //     });
    // }
}
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = new Session(context);
        yield session.initialize();
        context.subscriptions.push(vs.languages.setLanguageConfiguration("sml", sml.configuration));
        context.subscriptions.push(session);
    });
}
exports.activate = activate;
function deactivate() {
    return;
}
exports.deactivate = deactivate;
