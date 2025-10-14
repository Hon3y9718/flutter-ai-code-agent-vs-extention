import * as fs from 'fs';
import * as path from 'path';

export function getFlutterFiles(rootPath: string): string[] {
  const results: string[] = [];
  const scan = (dir: string) => {
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !file.startsWith('.')) {scan(fullPath);}
      else if (file.endsWith('.dart')) {results.push(fullPath);}
    }
  };
  if (fs.existsSync(rootPath)) {scan(rootPath);}
  return results;
}
