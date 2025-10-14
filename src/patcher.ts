import * as vscode from 'vscode';

/**
 * Applies a diff patch to a workspace file.
 * @param fileUri The URI of the file to patch.
 * @param diffContent The diff content in unified format.
 */
export async function applyDiffPatch(fileUri: vscode.Uri, diffContent: string) {
  const document = await vscode.workspace.openTextDocument(fileUri);
  const workspaceEdit = new vscode.WorkspaceEdit();

  // Basic parsing of a unified diff
  const diffLines = diffContent.split('\n');
  let currentDocLine = -1;

  for (const line of diffLines) {
    if (line.startsWith('@@')) {
      // Example: @@ -15,7 +15,7 @@
      const match = /@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/.exec(line);
      if (match) {
        // VS Code lines are 0-indexed, diffs are 1-indexed
        currentDocLine = parseInt(match[1], 10) - 1;
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      const lineContent = line.substring(1);
      const lineToDelete = document.lineAt(currentDocLine);

      // Simple check to ensure we're deleting the right line
      if (lineToDelete.text.trim() === lineContent.trim()) {
        const range = lineToDelete.range;
        workspaceEdit.delete(fileUri, range);
      }
      currentDocLine++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
        const lineContent = line.substring(1);
        // Deletions are processed first, so we insert at the line that was just "removed"
        const insertPosition = new vscode.Position(currentDocLine, 0);
        workspaceEdit.insert(fileUri, insertPosition, lineContent + '\n');
    } else if (!line.startsWith('---') && !line.startsWith('+++')) {
      // This is a context line, just advance the line counter
      currentDocLine++;
    }
  }

  await vscode.workspace.applyEdit(workspaceEdit);
}