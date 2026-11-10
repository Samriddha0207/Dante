from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    Flowable, KeepTogether
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output' / 'pdf' / 'Dante_CodeNexus_Final_Product_Report.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)

GREEN = colors.HexColor('#148457')
GREEN_PALE = colors.HexColor('#E8F3ED')
RED = colors.HexColor('#C93E3E')
RED_PALE = colors.HexColor('#F8EAEA')
GOLD = colors.HexColor('#D7A62A')
GOLD_PALE = colors.HexColor('#F7F0D9')
BLUE = colors.HexColor('#3E78A7')
BLUE_PALE = colors.HexColor('#EAF1F6')
INK = colors.black
MUTED = colors.HexColor('#3C3C3C')
GRID = colors.HexColor('#222222')
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name='CoverTitle', parent=styles['Title'], fontName='Helvetica-Bold',
    fontSize=33, leading=36, textColor=INK, alignment=TA_LEFT, spaceAfter=4
))
styles.add(ParagraphStyle(
    name='CoverSub', parent=styles['Normal'], fontName='Helvetica',
    fontSize=14, leading=18, textColor=INK, spaceAfter=5
))
styles.add(ParagraphStyle(
    name='Kicker', parent=styles['Normal'], fontName='Helvetica-Bold',
    fontSize=8.5, leading=10.5, textColor=INK, uppercase=True, tracking=1.0
))
styles.add(ParagraphStyle(
    name='Section', parent=styles['Heading1'], fontName='Helvetica-Bold',
    fontSize=20, leading=24, textColor=INK, spaceBefore=0, spaceAfter=7
))
styles.add(ParagraphStyle(
    name='Subsection', parent=styles['Heading2'], fontName='Helvetica-Bold',
    fontSize=13, leading=16, textColor=INK, spaceBefore=4, spaceAfter=4
))
styles.add(ParagraphStyle(
    name='BodyX', parent=styles['BodyText'], fontName='Helvetica',
    fontSize=10.2, leading=14.3, textColor=INK, spaceAfter=4
))
styles.add(ParagraphStyle(
    name='BodySmall', parent=styles['BodyText'], fontName='Helvetica',
    fontSize=9.0, leading=12.4, textColor=INK, spaceAfter=2
))
styles.add(ParagraphStyle(
    name='Cell', parent=styles['BodyText'], fontName='Helvetica',
    fontSize=8.8, leading=11.3, textColor=INK, spaceAfter=0
))
styles.add(ParagraphStyle(
    name='CellBold', parent=styles['BodyText'], fontName='Helvetica-Bold',
    fontSize=8.9, leading=11.5, textColor=INK, spaceAfter=0
))
styles.add(ParagraphStyle(
    name='CardTitle', parent=styles['BodyText'], fontName='Helvetica-Bold',
    fontSize=9.8, leading=12.2, textColor=INK, spaceAfter=2
))
styles.add(ParagraphStyle(
    name='CardBody', parent=styles['BodyText'], fontName='Helvetica',
    fontSize=8.6, leading=11.2, textColor=INK, spaceAfter=0
))
styles.add(ParagraphStyle(
    name='Status', parent=styles['BodyText'], fontName='Helvetica-Bold',
    fontSize=8.2, leading=9.8, textColor=INK, alignment=TA_CENTER
))
styles.add(ParagraphStyle(
    name='CenterSmall', parent=styles['BodyText'], fontName='Helvetica',
    fontSize=8.5, leading=10.6, textColor=INK, alignment=TA_CENTER
))


def P(text, style='BodyX'):
    return Paragraph(text, styles[style])


def plain(text):
    return escape(text).replace('\n', '<br/>')


def section(title, accent=GREEN):
    line = Table([['']], colWidths=[170 * mm], rowHeights=[1.5 * mm])
    line.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), accent),
        ('BOX', (0, 0), (-1, -1), 0, accent),
    ]))
    return [P(title, 'Section'), line, Spacer(1, 5)]


def clean_table(data, widths, header=True, padd=5, row_bgs=None):
    table = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign='LEFT')
    cmds = [
        ('BACKGROUND', (0, 0), (-1, -1), WHITE),
        ('TEXTCOLOR', (0, 0), (-1, -1), INK),
        ('GRID', (0, 0), (-1, -1), 0.55, GRID),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), padd),
        ('RIGHTPADDING', (0, 0), (-1, -1), padd),
        ('TOPPADDING', (0, 0), (-1, -1), padd),
        ('BOTTOMPADDING', (0, 0), (-1, -1), padd),
    ]
    if header:
        cmds += [
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('LINEBELOW', (0, 0), (-1, 0), 1, GRID),
        ]
    if row_bgs:
        for row_index, color in row_bgs.items():
            cmds.append(('BACKGROUND', (0, row_index), (-1, row_index), color))
    table.setStyle(TableStyle(cmds))
    return table


def feature_card(title, text, tint=GREEN_PALE):
    card = Table([[P(title, 'CardTitle')], [P(text, 'CardBody')]], colWidths=[82 * mm])
    card.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), WHITE),
        ('BOX', (0, 0), (-1, -1), 0.65, GRID),
        ('LINEBEFORE', (0, 0), (0, -1), 3.5, tint),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return card


class WorkflowDiagram(Flowable):
    def __init__(self, width=170 * mm, height=27 * mm):
        super().__init__()
        self.width, self.height = width, height

    def draw(self):
        labels = [
            ('APPROVE GUIDANCE', 'Facts, terms, assets', GREEN_PALE, GREEN),
            ('SUBMIT AND CHECK', 'Drafts; exact and semantic', BLUE_PALE, BLUE),
            ('REVIEW AND RECORD', 'Revise, exception, history', GOLD_PALE, GOLD),
            ('RECHECK AND LEARN', 'Impact; recurring patterns', RED_PALE, RED),
        ]
        gap = 10
        box_w = (self.width - gap * 3) / 4
        box_h = 48
        y = (self.height - box_h) / 2
        for i, (title, sub, fill, edge) in enumerate(labels):
            x = i * (box_w + gap)
            self.canv.setFillColor(fill)
            self.canv.setStrokeColor(edge)
            self.canv.setLineWidth(1.3)
            self.canv.roundRect(x, y, box_w, box_h, 4, fill=1, stroke=1)
            self.canv.setFillColor(INK)
            self.canv.setFont('Helvetica-Bold', 8.0)
            self.canv.drawCentredString(x + box_w / 2, y + 29, title)
            self.canv.setFont('Helvetica', 7.2)
            self.canv.drawCentredString(x + box_w / 2, y + 15, sub)
            if i < 3:
                self.canv.setStrokeColor(GREEN if i < 2 else RED)
                self.canv.setLineWidth(1.4)
                x1 = x + box_w + 1
                x2 = x + box_w + gap - 2
                ym = y + box_h / 2
                self.canv.line(x1, ym, x2, ym)
                self.canv.line(x2 - 3, ym + 3, x2, ym)
                self.canv.line(x2 - 3, ym - 3, x2, ym)


class EvidenceChart(Flowable):
    def __init__(self, width=170 * mm, height=24 * mm):
        super().__init__()
        self.width, self.height = width, height

    def draw(self):
        c = self.canv
        labels = [
            ('Off-brand content reported at some level', 81, GREEN),
            ('Aware of off-brand content in past year', 61, RED),
        ]
        label_w = 65 * mm
        bar_x = label_w
        max_w = 74 * mm
        for row, (label, value, color) in enumerate(labels):
            y = self.height - (row + 1) * 11 * mm + 2 * mm
            c.setFillColor(INK)
            c.setFont('Helvetica', 7.8)
            c.drawString(0, y + 2, label)
            c.setFillColor(colors.HexColor('#EEEEEE'))
            c.roundRect(bar_x, y, max_w, 5 * mm, 2, fill=1, stroke=0)
            c.setFillColor(color)
            c.roundRect(bar_x, y, max_w * value / 100, 5 * mm, 2, fill=1, stroke=0)
            c.setFillColor(INK)
            c.setFont('Helvetica-Bold', 8.2)
            c.drawString(bar_x + max_w + 3 * mm, y + 1, f'{value}%')


class ArchitectureDiagram(Flowable):
    def __init__(self, width=170 * mm, height=68 * mm):
        super().__init__()
        self.width, self.height = width, height

    def node(self, x, y, w, h, title, lines, fill, edge):
        c = self.canv
        c.setFillColor(fill)
        c.setStrokeColor(edge)
        c.setLineWidth(1.2)
        c.roundRect(x, y, w, h, 5, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont('Helvetica-Bold', 8.5)
        c.drawCentredString(x + w / 2, y + h - 14, title)
        c.setFont('Helvetica', 7.2)
        for index, line in enumerate(lines):
            c.drawCentredString(x + w / 2, y + h - 27 - index * 9, line)

    def arrow(self, x1, y1, x2, y2, color=GREEN):
        c = self.canv
        c.setStrokeColor(color)
        c.setFillColor(color)
        c.setLineWidth(1.4)
        c.line(x1, y1, x2, y2)
        import math
        a = math.atan2(y2 - y1, x2 - x1)
        pts = []
        for da, radius in [(-150, 5), (150, 5), (0, 0)]:
            aa = a + math.radians(da)
            pts.extend([x2 + radius * math.cos(aa), y2 + radius * math.sin(aa)])
        c.setFillColor(color)
        c.setStrokeColor(color)
        c.setLineWidth(0.5)
        c.drawPath(self._triangle(pts), fill=1, stroke=0)

    def _triangle(self, pts):
        from reportlab.pdfgen.pathobject import PDFPathObject
        p = PDFPathObject()
        p.moveTo(pts[0], pts[1])
        p.lineTo(pts[2], pts[3])
        p.lineTo(pts[4], pts[5])
        p.close()
        return p

    def draw(self):
        box_w, box_h = 45 * mm, 24 * mm
        x1, x2, x3 = 0, 62 * mm, 124 * mm
        upper_y, lower_y = 40 * mm, 3 * mm
        self.node(x1, upper_y, box_w, box_h, 'DANTE WORKSPACE', ['Next.js 16 + React 19', 'JavaScript and CSS UI'], GREEN_PALE, GREEN)
        self.node(x2, upper_y, box_w, box_h, 'API + REVIEW LOGIC', ['Auth, role, and cron checks', 'Rules, evidence, approvals'], BLUE_PALE, BLUE)
        self.node(x3, upper_y, box_w, box_h, 'SUPABASE', ['Auth + Postgres', 'Private Storage'], GREEN_PALE, GREEN)
        self.node(x1, lower_y, box_w, box_h, 'GEMINI (OPT-IN)', ['OCR / semantic help', 'Structured JSON; advisory'], GOLD_PALE, GOLD)
        self.node(x2, lower_y, box_w, box_h, 'QUALITY + ANALYTICS', ['Recharts operational views', 'Labeled-set evaluation'], BLUE_PALE, BLUE)
        self.node(x3, lower_y, box_w, box_h, 'HUMAN + WEBHOOK', ['Reviewer decision', 'Approved dispatch only'], RED_PALE, RED)
        upper_mid = upper_y + box_h / 2
        self.arrow(x1 + box_w, upper_mid, x2, upper_mid, GREEN)
        self.arrow(x2 + box_w, upper_mid, x3, upper_mid, GREEN)
        self.arrow(x2 + box_w / 2, upper_y, x1 + box_w / 2, lower_y + box_h, GOLD)
        self.arrow(x3 + box_w / 2, upper_y, x2 + box_w / 2, lower_y + box_h, BLUE)
        self.arrow(x2 + box_w, upper_y, x3 + box_w / 2, lower_y + box_h, RED)


doc = SimpleDocTemplate(
    str(OUT), pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm,
    topMargin=15 * mm, bottomMargin=16 * mm,
    title='Dante - CodeNexus Final Product Report', author='Team Chrollo',
    subject='Final product, implementation status, architecture, testing, and roadmap'
)
story = []

# Page 1 - Product overview
story += [Spacer(1, 8 * mm), P('CODENEXUS  /  NSEC  /  TEAM CHROLLO', 'Kicker'), Spacer(1, 2 * mm)]
story += [P('Dante', 'CoverTitle'), P('Brand change and drift tracking', 'CoverSub')]
story += [Spacer(1, 3 * mm)]
story += [P('<b>A source-linked review workspace for teams that need every claim to stay current.</b>', 'BodyX')]
story += section('The problem Dante solves', GREEN)
story += [P('Product facts, brand rules, approved terms, and visual assets often live in separate files and channels. New content can repeat outdated claims, while older material stays online after the underlying fact changes. Teams need to find affected items, see evidence, and route decisions to a person.', 'BodyX')]
story += [P('Why this problem matters', 'Subsection'), EvidenceChart()]
story += [P('Lucidpress, <i>The State of Brand Consistency</i> (2019), surveyed 200+ organizations. Historical, self-reported results; the two questions are distinct and are not a current benchmark. <link href="https://pubsecure.lucidpress.com/6e525791-56c1-4b3b-b9c4-e3db88727507/document.pdf" color="#000000">Open report</link>.', 'BodySmall')]
story += [Spacer(1, 2 * mm), P('Who it serves', 'Subsection')]
users = [
    [P('TEAM', 'CellBold'), P('NEED', 'CellBold')],
    [P('Brand and marketing', 'Cell'), P('Keep approved claims consistent across campaigns and channels.', 'Cell')],
    [P('Creators and designers', 'Cell'), P('Receive specific evidence and a useful correction path.', 'Cell')],
    [P('Brand reviewers', 'Cell'), P('Assess evidence, decide exceptions, and track changes.', 'Cell')],
    [P('Product and communications', 'Cell'), P('Update claims after facts or policies change.', 'Cell')],
    [P('Distributed teams', 'Cell'), P('Share current guidance with employees and agencies.', 'Cell')],
]
story += [clean_table(users, [48 * mm, 122 * mm], padd=3)]
story += [Spacer(1, 4 * mm), P('How the product works', 'Subsection'), WorkflowDiagram()]
story += [P('Full sequence: add guidance, approve its version, submit text and channel, check evidence, revise or record an exception, save the decision, recheck linked content after source changes, and review recurring patterns.', 'BodySmall')]
story += [Spacer(1, 3 * mm)]
story += [P('<b>Demo scenario:</b> an approved storage claim changes from 100 GB to 200 GB. Dante identifies linked drafts that still say 100 GB, shows the source version and evidence, and sends each item to a reviewer.', 'BodySmall')]
story += [P('<b>Team:</b> Samriddha Chaudhury, Team Lead and Full Stack Developer; Md Rizwaan Rahaman, Full Stack Developer. Contact: samriddhachaudhury@gmail.com.', 'BodySmall')]
story += [PageBreak()]

# Page 2 - Major features
story += section('Major features Dante offers', GREEN)
story += [P('A working workspace for governed content review, with clear boundaries between automated checks and human decisions.', 'BodyX'), Spacer(1, 2 * mm)]
features = [
    ('Approved source library', 'Create facts, rules, required terms, and logo assets. Keep approved versions and history.'),
    ('Evidence-linked content review', 'Run exact quantity and term checks. Optional Gemini rule review returns source and draft quotes for a person to assess.'),
    ('Change impact analysis', 'Preview linked content affected by a source update; stale or conflicting content returns to review.'),
    ('Human review and exceptions', 'Reviewers revise content or record a reasoned exception. Source changes and decisions enter the audit trail.'),
    ('PDF and DOCX policy intake', 'Extract likely rules with page or paragraph references. Administrators approve candidates before they become active.'),
    ('Scanned PDF OCR', 'When a page has little selectable text, the uploader can opt in to Gemini OCR. Candidates remain unapproved and carry a verification warning.'),
    ('Campaign image review', 'With explicit consent, Gemini transcribes visible copy and gives advisory logo and contrast findings; an approved logo image can be compared.'),
    ('Public page monitor', 'Schedule checks of public server-readable pages every 15 minutes, hourly, or daily. Initial snapshots and changes require reviewer decisions.'),
    ('Analytics and quality evaluation', 'Recharts show workspace activity. A confusion matrix combines curated cases with reviewer-labeled examples to report precision, recall, false alarms, and missed review flags.'),
    ('Workspace access and audit', 'Supabase Auth, roles, email-bound invitations, reviewer assignment with an assigned-first queue, private files, and CSV/JSON audit export.'),
    ('Publishing gate', 'A reviewer authorizes current content before Dante sends it to a configured generic HTTPS webhook.'),
    ('Safety controls', 'Server-side authorization, source-version checks, opt-in Gemini calls, private storage, and reset protection for persistent workspaces.'),
]
card_rows = []
for i in range(0, len(features), 2):
    a = feature_card(*features[i], [GREEN_PALE, BLUE_PALE, GOLD_PALE, RED_PALE][i % 4])
    b = feature_card(*features[i + 1], [BLUE_PALE, GREEN_PALE, RED_PALE, GOLD_PALE][i % 4]) if i + 1 < len(features) else ''
    card_rows.append([a, b])
grid = Table(card_rows, colWidths=[85 * mm, 85 * mm], hAlign='LEFT')
grid.setStyle(TableStyle([
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story += [grid, Spacer(1, 2 * mm), P('Dante does not auto-approve extracted rules or publish content without a reviewer action. Gemini outputs remain advisory.', 'BodySmall')]
story += [PageBreak()]

# Page 3 - The Round 3 commitments and delivery status
story += section('Round 3 focus areas and current status', RED)
story += [P('The Round 2 proposal named five outcomes. This table distinguishes what is now built from what remains limited.', 'BodyX'), Spacer(1, 2 * mm)]
status_rows = [
    [P('ROUND 2 COMMITMENT', 'CellBold'), P('STATUS', 'CellBold'), P('WHAT WORKS NOW / LIMITS', 'CellBold')],
    [P('Connect content sources', 'CellBold'), P('PARTIAL', 'Status'), P('Scheduled public-page text checks; reviewer-approved baseline and change review. Generic reviewer-gated webhook. Native CMS/OAuth connectors are still future work.', 'Cell')],
    [P('Bring in team guidance', 'CellBold'), P('IMPLEMENTED', 'Status'), P('PDF/DOCX extraction with page or paragraph references, opt-in scanned-PDF OCR, and administrator approval before activation.', 'Cell')],
    [P('Support team review', 'CellBold'), P('PARTIAL', 'Status'), P('Shared workspaces, roles, reviewer assignments, and an assigned-first in-app queue. No email/push notifications or configurable multi-stage approvals.', 'Cell')],
    [P('Measure review quality', 'CellBold'), P('PARTIAL', 'Status'), P('Curated fact-check baseline plus reviewer-labeled examples; confusion matrix, precision, recall, false alarms, and missed review flags. Small-set evaluation; no automatic tuning.', 'Cell')],
    [P('Broaden coverage', 'CellBold'), P('PARTIAL', 'Status'), P('Multilingual rule assistance and opt-in image/logo review route uncertainty to people. Coverage is limited; visual contrast is advisory, not WCAG measured.', 'Cell')],
]
story += [clean_table(status_rows, [38 * mm, 27 * mm, 105 * mm], padd=3)]
story += [Spacer(1, 3 * mm), P('Round 3 work delivered', 'Subsection')]
improvements = [
    [P('Scheduled sources', 'CellBold'), P('Configured intervals, guarded Vercel cron, page-change evidence, and human approval gates.', 'Cell')],
    [P('Team workflow', 'CellBold'), P('Reviewer assignments, assigned-first queue, role checks, audit entries, and duplicate-action protection.', 'Cell')],
    [P('Measured quality', 'CellBold'), P('Reviewer labels now feed a confusion matrix and transparent precision/recall and error counts.', 'Cell')],
    [P('Guidance and coverage', 'CellBold'), P('Traceable PDF/DOCX/OCR intake, language-aware rule review, and consented image/logo checks.', 'Cell')],
    [P('Reliability fixes', 'CellBold'), P('Persistent-workspace reset is blocked; reviewer-only source monitoring and schedule endpoint guards are enforced.', 'Cell')],
]
story += [clean_table([[P('IMPROVEMENT', 'CellBold'), P('DELIVERED', 'CellBold')]] + improvements, [43 * mm, 127 * mm], padd=3)]
story += [Spacer(1, 3 * mm)]
story += [PageBreak()]

# Page 4 - Architecture
story += section('Technical architecture', GREEN)
story += [P('The browser uses the authenticated workspace API. Server routes verify the session and workspace membership before loading or saving workspace data. Optional AI calls run server-side after explicit consent.', 'BodyX'), Spacer(1, 2 * mm)]
story += [ArchitectureDiagram(), Spacer(1, 4 * mm)]
stack = [
    [P('LAYER', 'CellBold'), P('IMPLEMENTATION', 'CellBold'), P('ROLE', 'CellBold')],
    [P('Application', 'Cell'), P('Next.js 16.4.5, React 19, JavaScript, CSS', 'Cell'), P('Authenticated shell, review UI, app routes, and workspace views.', 'Cell')],
    [P('API and rules', 'Cell'), P('Next.js Route Handler plus server.mjs', 'Cell'), P('Session / role checks, deterministic checks, Gemini orchestration, impact logic, and webhooks.', 'Cell')],
    [P('Data and identity', 'Cell'), P('Supabase Auth and PostgreSQL', 'Cell'), P('Workspace membership, sources, content, audit history, and saved state.', 'Cell')],
    [P('Files', 'Cell'), P('Supabase private Storage', 'Cell'), P('Original policy and logo files; admin-only short-lived document links.', 'Cell')],
    [P('AI', 'Cell'), P('Gemini GenerateContent REST API', 'Cell'), P('Opt-in structured OCR / semantic assistance; exact quotes are checked by the server.', 'Cell')],
    [P('Charts and deployment', 'Cell'), P('Recharts; Vercel Cron', 'Cell'), P('Workspace activity charts, evaluation measures, and scheduled page checks. Hosted cron and deployment still require production smoke testing.', 'Cell')],
]
story += [clean_table(stack, [34 * mm, 61 * mm, 75 * mm], padd=4)]
story += [Spacer(1, 3 * mm), P('Privacy boundary: Supabase and Gemini credentials remain server-side. The browser sends the user session to Dante; files are only forwarded to Gemini when the relevant consent is given.', 'BodySmall')]
story += [P('<b>Review reliability:</b> deterministic checks handle exact facts and required terms. Gemini assists with semantic interpretation or extraction; the server validates evidence against the approved source, and unclear findings stay with a human reviewer.', 'BodySmall')]
story += [PageBreak()]

# Page 5 - Testing and known gaps
story += section('Testing and reliability', BLUE)
test_rows = [
    [P('CHECK', 'CellBold'), P('RESULT', 'CellBold'), P('SCOPE', 'CellBold')],
    [P('Automated feature tests', 'Cell'), P('8 passed, 0 failed', 'CellBold'), P('Evidence and OCR gates; private originals; multilingual quote validation; reset protection; idempotent reviewer assignment; evaluation labels and metrics; monitor role and scheduled-job guards.', 'Cell')],
    [P('Production build', 'Cell'), P('Passed', 'CellBold'), P('Next.js compile, TypeScript phase, static route generation, and API route generation completed locally.', 'Cell')],
]
story += [clean_table(test_rows, [37 * mm, 31 * mm, 102 * mm], padd=5)]
story += [Spacer(1, 4 * mm), P('How to reproduce', 'Subsection')]
story += [P('<font name="Courier">node --test tests/round3-features.test.mjs</font><br/><font name="Courier">npm run build</font>', 'BodyX')]
story += [P('Test limits', 'Subsection')]
limits = [
    'Gemini is mocked in the automated tests. They verify request gating, parsing, evidence validation, and state transitions, but do not measure live-model accuracy.',
    'The OCR test uses a synthetic PDF with no text layer and a mocked transcript. A photographed/scanned guideline has not been evaluated against live Gemini OCR.',
    'The accuracy lab ships with a small curated numeric baseline. Workspace labels are supported, but no real pilot labels have been entered; these metrics are not a claim of real-world accuracy.',
    'Automated tests cover role gates and safe empty cron runs, not a full Vercel cron cycle, external website changes, native CMS integration, load, or production smoke testing.',
    'The monitor reads server-delivered HTML; JavaScript-rendered pages may be missed. Scheduled runs require CRON_SECRET and a configured Supabase service key in the hosted environment.',
]
for item in limits:
    story.append(P('- ' + plain(item), 'BodyX'))
story += [Spacer(1, 3 * mm), P('Current safeguards', 'Subsection')]
story += [P('Human approval is required for extracted rules and publishing. Stale source versions block publishing approval. Workspace routes check authentication and role; original policy files stay private; OCR and image analysis are opt-in.', 'BodyX')]
story += [PageBreak()]

# Page 6 - Roadmap and team
story += section('Product roadmap and future development', GREEN)
roadmap = [
    [P('NEXT', 'CellBold'), P('MEASURABLE OUTCOME', 'CellBold')],
    [P('Deploy and smoke-test the final build', 'CellBold'), P('Verify Supabase environment keys, OCR consent, PDF upload, role checks, original-file access, and the reviewer-gated webhook in the hosted environment.', 'Cell')],
    [P('Grow and validate the accuracy set', 'CellBold'), P('Collect human-reviewed examples across languages and channels; report error rates with sample size, then tune only after independent validation.', 'Cell')],
    [P('Add native source connectors', 'CellBold'), P('Integrate a CMS with scoped permissions, scheduled sync, idempotent updates, and a review step before approved guidance changes.', 'Cell')],
    [P('Improve multilingual and visual quality', 'CellBold'), P('Expand verified language coverage; compare OCR and semantic findings with human judgments; add measured contrast checks where technically reliable.', 'Cell')],
    [P('Extend team governance', 'CellBold'), P('Add email/push notifications, configurable approval stages, retention controls, and richer audit exports.', 'Cell')],
    [P('Surface recurring issues', 'CellBold'), P('Group repeated findings and overrides with examples, then compare the patterns against labeled review outcomes.', 'Cell')],
]
story += [clean_table(roadmap, [60 * mm, 110 * mm], padd=5)]
story += [Spacer(1, 4 * mm), P('Expected impact', 'Subsection')]
story += [P('Dante is designed to reduce time spent locating current guidance, surface stale claims before publishing, and give reviewers a traceable basis for decisions. Those benefits remain goals until measured with real teams and a labeled evaluation set.', 'BodyX')]
story += [Spacer(1, 3 * mm), P('Team', 'Subsection')]
team = [
    [P('MEMBER', 'CellBold'), P('ROLE', 'CellBold'), P('CONTRIBUTION', 'CellBold')],
    [P('Samriddha Chaudhury', 'Cell'), P('Team Lead; Full Stack Developer', 'Cell'), P('Product scope, backend, data model, source links, change-impact logic, review workflow, dashboards, and integration.', 'Cell')],
    [P('Md Rizwaan Rahaman', 'Cell'), P('Tester', 'Cell'), P('Demo content and testing.', 'Cell')],
]
story += [clean_table(team, [45 * mm, 48 * mm, 77 * mm], padd=4)]
story += [Spacer(1, 4 * mm), P('<b>Team Chrollo</b>  |  CodeNexus  |  NSEC  |  samriddhachaudhury@gmail.com', 'BodySmall')]
story += [Spacer(1, 2 * mm), P('Dante keeps the decision with the people who own the brand.', 'Subsection')]

doc.build(story)
print(OUT)
