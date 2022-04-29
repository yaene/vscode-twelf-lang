// copied from https://github.com/vrjuliao/sml-vscode-extension
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const smlEnviron = require('./smlEnvironmentManager');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// start sml exection
	smlEnviron.start();
	console.log('Congratulations, your extension "twelf" is now active!');
	
	let restartRepl = vscode.commands.registerCommand('twelf-server.restart', () => smlEnviron.restart());
	
	context.subscriptions.push(restartRepl);	

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(smlEnviron.didSaveDocument));
}

// this method is called when your extension is deactivated
function deactivate() {
	smlEnviron.stop();
}

module.exports = {
	activate,
	deactivate
}
