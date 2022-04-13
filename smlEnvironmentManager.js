// copied from https://github.com/vrjuliao/sml-vscode-extension
const spawn = require("child_process").spawn;
const vscode = require("vscode");
const pathutil = require('path')
const fs = require('fs')
// const uri2path = require('file-uri-to-path');
let sml;
let diagnostics;
const smlOutput = vscode.window.createOutputChannel("Twelf");
let allowNextCommand;
let pendingLines = [];

function resetDiagnostics(){
	pendingLines = [];
	// diagnostics.clear();
}

function processPendingLines(){
	diagnostics.clear();
	errregex = /^(.+?):(\d+)\.(\d+)(?:-(\d+).(\d+))?\s(\b(?:Error)\b):\s(.*(?:\n\s+.*)*)/m;
	const collatedDiagnostics = new Map();
	let i = 0; 
	while ( i < pendingLines.length) {
		const line = pendingLines[i];
		let match = line.match(errregex)
		if (match == null){
			i++;
			continue;
		}
		match.shift();
		const path = match.shift();
		let uri;
		try {
			// uri = vscode.Uri.parse(`file://${rootPath}/${path}`);
			// uri = vscode.Uri.file(path);
			uri = path;
		}
		catch (err) {
			continue;
		}
		if (!collatedDiagnostics.has(uri))
			collatedDiagnostics.set(uri, []);
		const curdiagnostics = collatedDiagnostics.get(uri);
		const startLine = parseInt(match.shift(), 10) - 1;
		const startChar = parseInt(match.shift(), 10) - 1;
		const endLine = parseInt(match.shift(), 10) - 1 || startLine;
		const endChar = parseInt(match.shift(), 10) - 1 || startChar;
		match.shift();
		let message = match.shift();
		// collect all messages before next diagnostic line
		i++;
		while (i < pendingLines.length && pendingLines[i].match(errregex) == null ){
			message += "\n" + pendingLines[i];
			i++;
		}
		// we've either reached the end of the output or next err line
		if (message != ""){
			const range = new vscode.Range(startLine, startChar, endLine, endChar);
			const item = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
			curdiagnostics.push(item);
		} else {
			console.log("bug?? empty err message from twelf server")
		}


	}
	for (const [key, value] of collatedDiagnostics.entries()) {
		if (value.length > 2){
			value.pop();
		}
	  }
	let allDiags = Array.from(collatedDiagnostics.entries());
	diagnostics.set(allDiags.map(([path, errs]) => [vscode.Uri.file(path), errs]));
	console.log("diag set");

}
function start() {
	allowNextCommand = false;
	const interpreter = vscode.workspace
	.getConfiguration()
	.get("twelf-server-path", "/usr/local/bin/twelf-server");

	diagnostics = vscode.languages.createDiagnosticCollection("twelf");

	var cwd = {};
	if (vscode.workspace.workspaceFolders !== undefined) {
		var wd = vscode.workspace.workspaceFolders[0].uri.fsPath;
		console.log("setting path to: " + wd);
		cwd = { cwd: wd };
	} else {
		console.log("Unable to set working directory, no current workspace folder");
	}
	
	sml = spawn(interpreter, [], Object.assign({ shell: true }, cwd));
	
	sml.stdin.setEncoding("utf-8");
	sml.stdout.setEncoding("utf-8");
	sml.stderr.setEncoding("utf-8");
	console.log("started");
	sml.stdin.write("help\n", (e) => {
		if (e){console.log("error writing", e) }
	});

	sml.on("error", function (err) {
		console.log(err);
		smlOutput.append(err.message);
	});

	sml.stderr.on("data", (data) => {
		// smlOutput.show(false);
		smlOutput.append(data + `\n`);
		allowNextCommand = true;
	});

	sml.stdout.on("data", (data) => {
		// smlOutput.show(false);
		smlOutput.append(data + `\n`);
		pendingLines = pendingLines.concat(data.toString().split("\n"));
		processPendingLines();
	});
	smlOutput.show(false);
}


function didSaveDocument(document) {
	console.log ("detected save " + document.uri);
	smlOutput.appendLine ("detected save " + document.uri);
	if ( document.languageId == "twelf"){
		let path = document.uri.fsPath;
		resetDiagnostics();
		let supposedConfigFile = pathutil.join(pathutil.dirname(path) ,  "/sources.cfg");
		let configExists = fs.existsSync(supposedConfigFile);
		if (configExists) {
			smlOutput.appendLine("path is " + supposedConfigFile);
			sml.stdin.write("Config.read " + supposedConfigFile + "\nConfig.load\n", (e) => {
				if (e){(console.log ("error writing", e))}});
		} else {
			smlOutput.appendLine("path is " + path);
			sml.stdin.write("loadFile " + path + "\n", (e) => {
				if (e){(console.log ("error writing", e))}});
		}
		// sml.stdin.flush();
	} else {
		smlOutput.appendLine("ignored uri "+ document.uri);
	}
}

// async function execCode(code) {
// 	while (!sml && !allowNextCommand) { ; }

// 	if (sml.exitCode === 0 || sml.exitCode)
// 		vscode.window.showErrorMessage("SML process died");
// 	else {
// 		try {
// 			allowNextCommand = false;
// 			sml.stdin.write(code + ";;;;\r\n");
// 		} catch (error) {
// 			smlOutput.append(error.message);
// 		}
// 	}
// 	await vscode.commands.executeCommand(
// 		"workbench.action.terminal.scrollToBottom"
// 	);
// }


// async function execShortCode() {
// 	const editor = vscode.window.activeTextEditor;

// 	if (editor) {
// 		const document = editor.document;
// 		const selection = editor.selection;
// 		const code = document.getText(selection);
// 		execCode(code);
// 	}
// }

// async function execCurrentFile() {
// 	restart()

// 	const editor = vscode.window.activeTextEditor;

// 	if (editor) {
// 		const document = editor.document
// 		const code = document.getText()
// 		execCode(code);
//   }
// }

function restart() {
	if (sml.exitCode !== 0 && !sml.exitCode) {
		sml.stdin.end();
	}
	sml.kill();
	start();
}
	
function stop() {
	sml.stdin.end();
}

module.exports = {
	start,
	stop,
	restart,
	didSaveDocument
	// execShortCode,
	// execCurrentFile
};
