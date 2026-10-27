#!/usr/bin/env python3
"""Print the same month grid/list as the web page, plus optional page-two early releases."""
import argparse
import calendar
import colorsys
import json
import math
import os
import re
import unicodedata
from datetime import date, datetime, timezone
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, legal, A3
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Flowable, Paragraph, Table, TableStyle
from pypdf import PdfReader

MARGIN = 28


def text(value):
    value = str(value or '').translate(str.maketrans({'\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2026': '...', '\u00a0': ' ', '\u2022': '-', '\u2192': '->'}))
    return unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')


def day(value):
    return date.fromisoformat(value)


def date_label(start, end=None):
    first, last = day(start), day(end or start)
    label = first.strftime('%b ') + str(first.day)
    if first == last:
        return label
    if first.year == last.year and first.month == last.month:
        return label + '-' + str(last.day)
    return label + ' - ' + last.strftime('%b ') + str(last.day)


def palette(data):
    return {key: colors.Color(*colorsys.hls_to_rgb(value[0], value[2], value[1])) for key, value in data['palette'].items()}


def linked_text(value, color):
    value = text(value)
    parts, cursor = [], 0
    for match in re.finditer(r'https?://[^\s<>]+', value):
        url = match.group().rstrip('.,;)')
        parts.append(escape(value[cursor:match.start()]))
        parts.append('<a href="' + escape(url, {'"': '&quot;'}) + '" color="' + color + '">' + escape(url) + '</a>')
        cursor = match.start() + len(url)
    parts.append(escape(value[cursor:]))
    return ''.join(parts).replace('\n', '<br/>')


def month_numbers(data):
    first, last = day(data['firstDay']), day(data['lastDay'])
    start, end = first.year * 12 + first.month - 1, last.year * 12 + last.month - 1
    return [(value // 12, value % 12 + 1) for value in range(start, end + 1)]


def month_entries(data, year, month, width, style, p):
    entries = []
    for event in data['monthEvents']:
        # Match the web month list: a cross-month range is listed where it starts.
        if event['start'][:7] != f'{year:04d}-{month:02d}':
            continue
        label = '<b>' + escape(date_label(event['start'], event['end'])) + '</b> - ' + linked_text(event['name'], p['brand'].hexval().replace('0x', '#'))
        for context in event['context']:
            label += '<br/>' + escape(text(context)) + ' (school-specific ceremony)'
        if event['showNote'] and event['note']:
            label += '<br/>' + linked_text(event['note'], p['brand'].hexval().replace('0x', '#'))
        if event['conditionalNote']:
            label += '<br/>' + escape(text(event['conditionalNote']))
        if event['calculated']:
            label += '<br/>Calculated from calendar'
        if 'REGENTS' in event['types'] and event['schoolStatus'] == 'exam-day':
            label += '<br/>Exam period; not a districtwide closure.'
        paragraph = Paragraph(label, style)
        height = paragraph.wrap(width, 10000)[1]
        entries.append((paragraph, height))
    return entries


class MonthCard(Flowable):
    def __init__(self, data, p, year, month, width, font_size):
        super().__init__()
        self.data, self.p, self.year, self.month, self.width = data, p, year, month, width
        style = ParagraphStyle('month-note', fontName='Helvetica', fontSize=font_size, leading=font_size + 1.2, textColor=p['ink'])
        self.entries = month_entries(data, year, month, width - 10, style, p)
        self.height = 86 + sum(height + 3 for _, height in self.entries) + 3

    def draw(self):
        c, p, top, width = self.canv, self.p, self.height, self.width
        c.setLineWidth(.35); c.setFillColor(p['panel']); c.setStrokeColor(p['line'])
        c.rect(0, 0, width, top, stroke=1, fill=1)
        c.setFillColor(p['brand']); c.rect(0, top - 16, width, 16, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont('Helvetica-Bold', 8.5)
        c.drawCentredString(width / 2, top - 11, calendar.month_name[self.month] + ' ' + str(self.year))
        cell_w = width / 7
        c.setFillColor(p['brand-soft']); c.rect(0, top - 26, width, 10, stroke=0, fill=1)
        c.setFont('Helvetica-Bold', 5.8)
        for col, label in enumerate(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']):
            c.setFillColor(p['brand']); c.drawCentredString((col + .5) * cell_w, top - 23, label)
        weeks = calendar.Calendar(firstweekday=0).monthdayscalendar(self.year, self.month)
        weeks += [[0] * 7 for _ in range(6 - len(weeks))]
        for row, week in enumerate(weeks):
            for col, number in enumerate(week):
                x, y = col * cell_w, top - 26 - (row + 1) * 9.3
                value = f'{self.year:04d}-{self.month:02d}-{number:02d}' if number else None
                tone = self.data['dayTones'].get(value)
                fill, ink = p['panel'], p['ink']
                if not number or col >= 5:
                    fill, ink = p['panel-muted'], p['ink-dim']
                if tone:
                    fill, ink = {
                        'boundary': (p['brand'], p['panel']),
                        'break': (p['brand-soft'], p['brand']),
                        'holiday': (p['warning-soft'], p['warning-ink']),
                        'important': (p['panel-strong'], p['ink']),
                        'conditional': (p['panel'], p['warning-ink']),
                    }[tone]
                c.setFillColor(fill); c.setStrokeColor(p['line']); c.rect(x, y, cell_w, 9.3, stroke=1, fill=1)
                if number:
                    c.setFillColor(ink); c.setFont('Helvetica-Bold' if tone else 'Helvetica', 7)
                    c.drawCentredString(x + cell_w / 2, y + 2.3, str(number))
                    if tone == 'conditional':
                        c.setDash(1, 1); c.setStrokeColor(p['warning-ink']); c.rect(x + 1, y + 1, cell_w - 2, 7.3, stroke=1, fill=0); c.setDash()
        y = top - 86
        for paragraph, height in self.entries:
            paragraph.drawOn(c, 5, y - height)
            y -= height + 3


def month_layout(data, p, page_width, font_size):
    width = (page_width - MARGIN * 2 - 12) / 3
    cards = [MonthCard(data, p, year, month, width, font_size) for year, month in month_numbers(data)]
    rows = [cards[index:index + 3] for index in range(0, len(cards), 3)]
    return rows, sum(max(card.height for card in row) + 6 for row in rows)


def early_release_table(data, p, width):
    # Shared weekly schedules can list all dates once, without 36 repeated paragraphs.
    grouped = {}
    for event in data['earlyRelease']:
        details = [event['name']]
        if event['scope']:
            details.append('Applies to: ' + event['scope'])
        details.extend(item['gradeScope'] + ': half day' for item in event['scheduleDetails'])
        if event['conditionalNote']:
            details.append(event['conditionalNote'])
        key = tuple(details)
        grouped.setdefault(key, []).append(date_label(event['start'], event['end']))
    style = ParagraphStyle('early-cell', fontName='Helvetica', fontSize=8, leading=10.5, textColor=p['ink'])
    head = ParagraphStyle('early-head', fontName='Helvetica-Bold', fontSize=8, leading=11, textColor=colors.white)
    rows = [[Paragraph('Date(s)', head), Paragraph('Early Release', head)]]
    for details, dates in grouped.items():
        rows.append([Paragraph(escape('; '.join(dates)), style), Paragraph('<br/>'.join(escape(text(part)) for part in details), style)])
    table = Table(rows, colWidths=[width * .46, width * .54], hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), p['brand']), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [p['panel'], p['canvas']]),
        ('LINEBELOW', (0, 0), (-1, -1), .35, p['line']),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
    ]))
    return table


def page_header(c, data, p, size, page, total):
    width, height = size
    c.setFillColor(p['brand']); c.setFont('Helvetica-Bold', 8)
    c.drawRightString(width - MARGIN, height - 18, 'FLschoolcalendar.com')
    c.linkURL(data['pageUrl'], (width - MARGIN - 83, height - 22, width - MARGIN, height - 10), thickness=0)
    title = Paragraph(escape(text(data['title'])), ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=13, leading=15, textColor=p['brand']))
    _, title_h = title.wrap(width - 2 * MARGIN, 70)
    title.drawOn(c, MARGIN, height - 29 - title_h)
    c.setFillColor(p['ink-muted']); c.setFont('Helvetica', 6.7)
    c.drawString(MARGIN, height - 35 - title_h, 'Updated ' + data['updatedAt'])
    c.setFont('Helvetica', 7)
    c.drawString(MARGIN, 18, 'FLschoolcalendar.com')
    c.linkURL(data['pageUrl'], (MARGIN, 14, MARGIN + 85, 26), thickness=0)
    c.drawRightString(width - MARGIN, 18, f'Page {page} of {total}')
    return height - 44 - title_h


def draw_legend(c, p, width, top, conditional):
    items = [('School Day', 'panel'), ('Weekend', 'panel-muted'), ('Holiday (No School)', 'warning-soft'), ('School Break', 'brand-soft'), ('First / Last Day', 'brand'), ('Important Date', 'panel-strong')]
    if conditional:
        items.append(('Conditional attendance', 'panel'))
    columns = 4
    for index, (label, fill) in enumerate(items):
        x, y = MARGIN + (index % columns) * width / columns, top - 10 - (index // columns) * 12
        c.setFillColor(p[fill]); c.setStrokeColor(p['line']); c.rect(x, y, 6, 6, fill=1, stroke=1)
        if label == 'Conditional attendance':
            c.setDash(1, 1); c.setStrokeColor(p['warning-ink']); c.rect(x, y, 6, 6, fill=0, stroke=1); c.setDash()
        c.setFillColor(p['ink-muted']); c.setFont('Helvetica', 6)
        c.drawString(x + 9, y, label)
    return top - 30


def render(data, output):
    os.environ['SOURCE_DATE_EPOCH'] = str(int(datetime.combine(day(data['updatedAt']), datetime.min.time(), timezone.utc).timestamp()))
    p = palette(data)
    total = 2 if data['earlyRelease'] else 1
    # Fit the full month grid on page one; never omit entries or make a third page.
    layout = None
    for size in [letter, legal, A3]:
        width, height = size
        for font_size in [6.6, 6.3, 6.0]:
            rows, needed = month_layout(data, p, width, font_size)
            title = Paragraph(escape(text(data['title'])), ParagraphStyle('measure-title', fontName='Helvetica-Bold', fontSize=13, leading=15))
            title_h = title.wrap(width - 2 * MARGIN, 70)[1]
            if needed > height - 44 - title_h - 30 - 36:
                continue
            early = early_release_table(data, p, width - 2 * MARGIN) if data['earlyRelease'] else None
            if early and early.wrap(width - 2 * MARGIN, 10000)[1] > height - 44 - title_h - 32 - 36:
                continue
            layout = (size, rows, early)
            break
        if layout:
            break
    if not layout:
        raise ValueError('Calendar cannot fit two readable pages: ' + data['filename'])
    size, rows, early = layout
    width, height = size
    c = canvas.Canvas(output, pagesize=size, invariant=1, pageCompression=1)
    c.setTitle(text(data['title'])); c.setAuthor('FL School Calendar'); c.setCreator('FL School Calendar')
    y = page_header(c, data, p, size, 1, total)
    y = draw_legend(c, p, width - 2 * MARGIN, y, 'conditional' in data['dayTones'].values())
    card_width = (width - 2 * MARGIN - 12) / 3
    for row in rows:
        for index, card in enumerate(row):
            card.drawOn(c, MARGIN + index * (card_width + 6), y - card.height)
        y -= max(card.height for card in row) + 6
    c.showPage()
    if early:
        y = page_header(c, data, p, size, 2, total)
        c.setFillColor(p['brand']); c.setFont('Helvetica-Bold', 13); c.drawString(MARGIN, y - 15, 'Early Release')
        table_h = early.wrap(width - 2 * MARGIN, 10000)[1]
        early.drawOn(c, MARGIN, y - 28 - table_h)
        c.showPage()
    c.save()
    reader = PdfReader(output)
    if len(reader.pages) != total:
        raise ValueError('Unexpected PDF page count')
    first_text = reader.pages[0].extract_text() or ''
    normalized = re.sub(r'\s+', '', text(first_text)).lower()
    first_month, last_month = month_numbers(data)[0], month_numbers(data)[-1]
    for year, month in month_numbers(data):
        if calendar.month_name[month] + ' ' + str(year) not in first_text:
            raise ValueError('Missing month grid')
    for event in data['monthEvents']:
        month = (day(event['start']).year, day(event['start']).month)
        if month < first_month or month > last_month:
            continue
        for expected in [event['name'], date_label(event['start'], event['end'])]:
            if re.sub(r'\s+', '', text(expected)).lower() not in normalized:
                raise ValueError('Missing monthly entry: ' + expected)
    if early:
        early_text = re.sub(r'\s+', '', text(reader.pages[1].extract_text())).lower()
        for event in data['earlyRelease']:
            for expected in [event['name'], date_label(event['start'], event['end']), event['scope'] or '']:
                if re.sub(r'\s+', '', text(expected)).lower() not in early_text:
                    raise ValueError('Missing page-two early release: ' + expected)
    for page in reader.pages:
        page_text = page.extract_text() or ''
        if any(label in page_text for label in ['Calendar scope:', 'Official Sources and Updates', 'Early-release dates remain attendance days.', 'Extended Time Off', 'Other Important Dates', 'Key Dates']):
            raise ValueError('Unexpected supplementary PDF section')
        links = {a.get_object().get('/A', {}).get('/URI') for a in page.get('/Annots', [])}
        if data['pageUrl'] not in links:
            raise ValueError('Missing clickable website link')
    return {'filename': data['filename'], 'pages': total}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    with open(args.input, encoding='utf-8') as handle:
        data = json.load(handle)
    print(json.dumps([render(item, os.path.join(args.output, item['filename'])) for item in data]))


if __name__ == '__main__':
    main()
