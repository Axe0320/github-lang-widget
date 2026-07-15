import fs from 'fs'
import path from 'path'

// Node.js runtime (not edge) so we can read the sibling script file directly.
// Serves scriptable/widget-body.js as plain text for loader.js to fetch + eval.
export default function handler(req, res) {
  const filePath = path.join(process.cwd(), 'scriptable', 'widget-body.js')
  const code = fs.readFileSync(filePath, 'utf-8')

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(code)
}
