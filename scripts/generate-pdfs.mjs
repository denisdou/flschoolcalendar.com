import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { buildPdfJobs, pdfHash, pdfPalette } from './lib/calendar-pdf-data.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'public/pdf')
const manifestFile = join(output, 'manifest.json')
const renderer = join(root, 'scripts/render-calendar-pdf.py')

export function pdfIsCurrent(job, entry, rendererHash, fileBytes) {
  const inputHash = pdfHash(JSON.stringify(job.payload) + rendererHash)
  return Boolean(entry && entry.inputHash === inputHash && fileBytes
    && fileBytes.subarray(0, 5).toString() === '%PDF-' && entry.fileHash === pdfHash(fileBytes))
}

export function main(args = process.argv.slice(2)) {
  let district = null, year = null, check = false, dryRun = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--district') district = args[++i]
    else if (args[i] === '--school-year') year = args[++i]
    else if (args[i] === '--check') check = true
    else if (args[i] === '--dry-run') dryRun = true
    else throw new Error('Unknown PDF option: ' + args[i])
  }
  const recordsDir = join(root, 'server/data/districts/records')
  const records = readdirSync(recordsDir).filter(file => file.endsWith('.json')).sort()
    .map(file => JSON.parse(readFileSync(join(recordsDir, file), 'utf8')))
  const palette = pdfPalette(readFileSync(join(root, 'app/assets/css/main.css'), 'utf8'))
  const jobs = buildPdfJobs(records, palette).filter(job => (!district || job.payload.districtSlug === district)
    && (!year || job.payload.route === year || job.payload.year === year))
  if (!jobs.length) throw new Error('No audited, published calendars match the PDF selection')
  const rendererHash = pdfHash(readFileSync(renderer) + readFileSync(join(root, 'scripts/pdf-requirements.txt'), 'utf8'))
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { schemaVersion: 1, calendars: {} }
  const pending = jobs.filter(job => !pdfIsCurrent(job, manifest.calendars[job.filename], rendererHash,
    existsSync(join(output, job.filename)) ? readFileSync(join(output, job.filename)) : null))
  if (check) {
    if (pending.length) throw new Error(`${pending.length} calendar PDFs are missing or stale. Finish the audit, update contentUpdatedAt, then run pnpm pdf:generate.\n${pending.map(job => job.filename).join('\n')}`)
    console.log(`All ${jobs.length} calendar PDFs are current; no files changed.`)
    return
  }
  if (!pending.length || dryRun) {
    console.log(`${pending.length} PDFs need generation; ${jobs.length - pending.length} unchanged.`)
    if (dryRun) for (const job of pending) console.log(job.filename)
    return
  }
  const staging = mkdtempSync(join(tmpdir(), 'fl-calendar-pdfs-'))
  try {
    const input = join(staging, 'calendars.json')
    writeFileSync(input, JSON.stringify(pending.map(job => job.payload)))
    const python = process.env.CALENDAR_PDF_PYTHON || (existsSync(join(root, '.venv-pdf/bin/python')) ? join(root, '.venv-pdf/bin/python') : 'python3')
    const result = spawnSync(python, [renderer, '--input', input, '--output', staging], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    if (result.error || result.status !== 0) throw new Error(`PDF rendering failed. Install scripts/pdf-requirements.txt in .venv-pdf first.\n${result.error?.message || result.stderr}`)
    const rendered = JSON.parse(result.stdout)
    mkdirSync(output, { recursive: true })
    for (const job of pending) {
      const file = join(staging, job.filename)
      const bytes = readFileSync(file)
      const report = rendered.find(item => item.filename === job.filename)
      if (!report || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid rendered PDF: ' + job.filename)
      const target = join(output, job.filename)
      const temporary = target + '.tmp-' + process.pid
      copyFileSync(file, temporary)
      renameSync(temporary, target)
      manifest.calendars[job.filename] = {
        contentUpdatedAt: job.payload.updatedAt,
        inputHash: pdfHash(JSON.stringify(job.payload) + rendererHash), fileHash: pdfHash(bytes), pages: report.pages,
      }
    }
    const temporary = manifestFile + '.tmp-' + process.pid
    writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n')
    renameSync(temporary, manifestFile)
    console.log(`Generated ${pending.length} PDFs in public/pdf; ${jobs.length - pending.length} unchanged.`)
  }
  finally { rmSync(staging, { recursive: true, force: true }) }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
