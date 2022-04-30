// copied from https://github.com/vrjuliao/sml-vscode-extension
const spawn = require("child_process").spawn;
const vscode = require("vscode");
const pathutil = require('path')
const fs = require('fs')
// const uri2path = require('file-uri-to-path');
let sml;
let diagnostics;
const smlOutput = vscode.window.createOutputChannel("Twelf");
let cid = 0; // increase per processing
let pendingLines = [];
let currentTimeOutOfProcessing = undefined;

let statusBarItem;

function resetDiagnostics(){
	pendingLines = [];
	// diagnostics.clear();
}

let processPendingLines = function (){
	currentTimeOutOfProcessing = undefined;
	cid += 1;
// COPIED FROM https://marketplace.visualstudio.com/items?itemName=freebroccolo.sml
// NOTICE: possibly without copyright as the code is not under a open source license (it is closed source! 
// I extracted the code from the vscode extension market place)
// SO I am not going to publish this (or redistribute) until the author has given explicit permission
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
		while (i < pendingLines.length && pendingLines[i].match(errregex) == null){
			if (/^\[Closing file/.test(pendingLines[i]))
			{
				// filter out certain twelf statistical information
			}
			else
			{
				message += "\n" + pendingLines[i];
			}
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
	// for (const [key, value] of collatedDiagnostics.entries()) {
	// 	// remove the errors count that is printed at the end of every file
	// 	if (value.length > 2){
	// 		value.pop();
	// 	}
	//   }
	let allDiags = Array.from(collatedDiagnostics.entries());
	let errsCount = 0;
	diagnostics.set(allDiags.map(([path, errs]) => {
		let uri =vscode.Uri.file(path);
		// remove the errors count that is printed at the end of every file
		if (/\d+\serrors?\sfound/.test(errs[errs.length -1].message)){
			errs.pop();
		}
		errsCount += errs.length;
		return [uri, errs];
	}));
	console.log("diag set");
	if (errsCount == 0){
		statusBarItem.text = `Twelf: OK`
	} else {
		statusBarItem.text = `Twelf: ${errsCount} error${errsCount > 1 ? "s" : ""} found`
	}
	statusBarItem.show();

}
function start() {
	allowNextCommand = false;
	const interpreter = vscode.workspace
	.getConfiguration()
	.get("twelf-server-path", "/usr/local/bin/twelf-server");

	diagnostics = vscode.languages.createDiagnosticCollection("twelf");
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	statusBarItem.name = "Twelf Status"

	var cwd = {};
	if (vscode.workspace.workspaceFolders !== undefined) {
		var wd = vscode.workspace.workspaceFolders[0].uri.fsPath;
		console.log("setting path to: " + wd);
		cwd = { cwd: wd };
	} else {
		console.log("Unable to set working directory, no current workspace folder");
	}
	
	// to get type inference
	let localsml = spawn(interpreter, [], Object.assign({ shell: true }, cwd));
	sml = localsml
	
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
		if (currentTimeOutOfProcessing) {
			clearTimeout(currentTimeOutOfProcessing);
		}
		currentTimeOutOfProcessing = setTimeout(() => {
			processPendingLines();
		}, 50); // 50 ms delay before processing events, cancel processing if additional data received within 50ms
	});
	smlOutput.show(false);
}


function didSaveDocument(document) {
	console.log ("detected save " + document.uri);
	smlOutput.appendLine ("detected save " + document.uri);
	if ( document.languageId == "twelf"){
		statusBarItem.text = `Twelf: Checking`
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
			sml.stdin.write("reset\nloadFile " + path + "\n", (e) => {
				if (e){(console.log ("error writing", e))}});
		}
		console.log("command sent")
		// sml.stdin.flush();
	} else {
		smlOutput.appendLine("ignored uri "+ document.uri);
	}
}


function restart() {
	if (sml.exitCode !== 0 && !sml.exitCode) {
		sml.stdin.end();
	}
	sml.kill();
	statusBarItem.dispose();
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
};
