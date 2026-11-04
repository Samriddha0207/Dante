from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable, Flowable)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.colors import HexColor
from xml.sax.saxutils import escape

OUT = r'output/pdf/Dante_Hackathon_Proposal.pdf'
NAVY = HexColor('#3E2D46'); BLUE = HexColor('#756084'); TEAL = HexColor('#C7654A')
PALE = HexColor('#F2EAF2'); LIGHT = HexColor('#FAF6F2'); INK = colors.black
MUTED = colors.black; BORDER = colors.black; AMBER = HexColor('#FFF1DE')
GREEN = HexColor('#219653'); RED = HexColor('#E34B4B')
ACCENTS = [HexColor(x) for x in ('#2E8B57','#F05A47','#F2B544','#3D9CCB','#8C6CC1','#43B7A7')]

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='CoverTitleX', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=30, leading=35, textColor=colors.black, alignment=TA_LEFT, spaceAfter=9))
styles.add(ParagraphStyle(name='CoverSubX', parent=styles['Normal'], fontName='Helvetica', fontSize=14, leading=20, textColor=colors.black, spaceAfter=6))
styles.add(ParagraphStyle(name='SectionX', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=23, textColor=colors.black, spaceBefore=4, spaceAfter=10, keepWithNext=True))
styles.add(ParagraphStyle(name='SubX', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=colors.black, spaceBefore=8, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle(name='BodyX', parent=styles['BodyText'], fontName='Helvetica', fontSize=10.2, leading=15.2, textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle(name='SmallX', parent=styles['BodyText'], fontName='Helvetica', fontSize=8.5, leading=12, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name='BulletX', parent=styles['BodyText'], fontName='Helvetica', fontSize=10, leading=14.5, leftIndent=12, firstLineIndent=-8, bulletIndent=0, textColor=INK, spaceAfter=4))
styles.add(ParagraphStyle(name='CellX', parent=styles['BodyText'], fontName='Helvetica', fontSize=9.2, leading=12.4, textColor=INK, spaceAfter=0))
styles.add(ParagraphStyle(name='CellHeadX', parent=styles['BodyText'], fontName='Helvetica-Bold', fontSize=9.2, leading=12, textColor=colors.black, spaceAfter=0))
styles.add(ParagraphStyle(name='CellLabelX', parent=styles['BodyText'], fontName='Helvetica-Bold', fontSize=9.2, leading=12.4, textColor=INK, spaceAfter=0))
styles.add(ParagraphStyle(name='CalloutX', parent=styles['BodyText'], fontName='Helvetica-Bold', fontSize=11, leading=16, textColor=NAVY, spaceAfter=2))
styles.add(ParagraphStyle(name='LabelX', parent=styles['BodyText'], fontName='Helvetica-Bold', fontSize=7.5, leading=10, textColor=colors.black, spaceAfter=2))

# Enforce the requested black-only type treatment across every paragraph style.
for _style in styles.byName.values():
    if hasattr(_style, 'textColor'):
        _style.textColor = colors.black

P=lambda text, style='BodyX': Paragraph(text, styles[style])
def bullet(text): return Paragraph('•  '+text, styles['BulletX'])
def section(num, title): return P(f'{num:02d}  {title}', 'SectionX')
def cell(text, head=False): return P(text, 'CellHeadX' if head else 'CellX')
def table(data, widths, header=True):
    t=Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign='LEFT')
    commands=[('GRID',(0,0),(-1,-1),0.45,colors.black),('BACKGROUND',(0,0),(-1,-1),colors.white),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]
    t.setStyle(TableStyle(commands)); return t

def header_footer(canvas, doc):
    # Small text-free geometric accents keep the cover lively without a top banner.
    canvas.saveState(); w,h=A4
    if doc.page == 1:
        pass
    canvas.restoreState()

class EvidenceCharts(Flowable):
    def __init__(self, width=166*mm, height=109*mm):
        super().__init__(); self.width=width; self.height=height
    def draw_bar_group(self, x, top, panel_w, title, rows, color):
        c=self.canv; labelw=panel_w-12*mm; barw=panel_w-10*mm
        c.setFont('Helvetica-Bold',8.2); c.setFillColor(colors.black); c.drawString(x,top,title)
        ytop=top-15
        for label,val,note in rows:
            c.setFont('Helvetica',7.6); c.setFillColor(colors.black); c.drawString(x,ytop,label)
            y=ytop-11; c.setFillColor(HexColor('#E8E8E8')); c.roundRect(x,y,barw,6.5,2,fill=1,stroke=0)
            bar_color = GREEN if 'consistently' in label.lower() else color
            c.setFillColor(bar_color); c.roundRect(x,y,barw*val/100,6.5,2,fill=1,stroke=0)
            c.setFont('Helvetica-Bold',7.6); c.setFillColor(colors.black); c.drawRightString(x+panel_w,ytop-9,f'{val:g}%')
            c.setFont('Helvetica-Oblique',6.5); c.setFillColor(colors.black); c.drawString(x,ytop-21,note)
            ytop-=31
    def draw(self):
        c=self.canv; w=self.width; c.saveState()
        c.setFont('Helvetica-Bold',10.5); c.setFillColor(colors.black); c.drawString(0,self.height-12,'Published survey findings (Lucidpress, 2019)')
        c.setFont('Helvetica',7.5); c.setFillColor(colors.black); c.drawString(0,self.height-23,'Self-reported results. Left and right panels use different questions.')
        gap=8*mm; pw=(w-gap)/2; top=self.height-39
        self.draw_bar_group(0,top,pw,'CONTENT AND ACCESS',[
            ('Off-brand content at any level',81,'Report summary; 19% said "never"'),
            ('Aware of off-brand content in past year',61,'Direct response'),
            ('Guidelines hard to find',26,'Direct response'),
            ('Market confusion cited',24.5,'Select all applicable effects'),
            ('Reputation damage cited',18.6,'Select all applicable effects')],RED)
        self.draw_bar_group(pw+gap,top,pw,'GUIDELINE ENFORCEMENT',[
            ('Formal, consistently enforced',25,'Direct response'),
            ('Formal, selectively enforced',27,'Direct response'),
            ('Formal, not enforced',11,'Direct response'),
            ('Informal guidelines',29,'Direct response'),
            ('No guidelines',8,'Direct response')],RED)
        # A compact 100% comparison bar for reported brand presentation.
        base=7*mm; bar_y=base+10; bar_w=w
        c.setFont('Helvetica-Bold',8); c.setFillColor(colors.black); c.drawString(0,base+32,'REPORTED BRAND PRESENTATION (GROUPED RESPONSE CATEGORIES)')
        parts=[('Consistent',58,GREEN),('Neutral',22,HexColor('#D9D9D9')),('Inconsistent',20,RED)]
        xx=0
        for label,val,col in parts:
            ww=bar_w*val/100; c.setFillColor(col); c.rect(xx,bar_y,ww,11,fill=1,stroke=0)
            c.setFillColor(colors.black); c.setFont('Helvetica-Bold',7); c.drawCentredString(xx+ww/2,bar_y+3,f'{val}%')
            xx+=ww
        xx=0
        for label,val,col in parts:
            ww=bar_w*val/100; c.setFillColor(colors.black); c.setFont('Helvetica',6.7); c.drawCentredString(xx+ww/2,base,label); xx+=ww
        c.restoreState()

story=[P('CODENEXUS  /  TEAM CHROLLO  /  NSEC','LabelX'),P('Dante','CoverTitleX'),P('Brand change and drift tracking','CoverSubX')]

story += [section(1,'Understanding of the problem statement'),P('Brand facts, rules, terms, and approved assets are scattered across documents and teams. A reviewer may catch a wrong claim in a new post, while older material stays online after the underlying fact changes. Teams need checks before publication and a way to find affected content later, with evidence and human review.')]
story += [section(2,'Users affected by the problem'),table([[cell('User group',True),cell('Need',True)],[cell('Brand / marketing'),cell('Consistent campaigns across teams and channels.')],[cell('Creators / designers'),cell('Clear fixes that preserve the intent of their work.')],[cell('Brand reviewers'),cell('Evidence, exception handling, and review history.')],[cell('Product / communications'),cell('Update claims when facts or policies change.')],[cell('Distributed teams'),cell('Shared, current guidance for employees and agencies.')]], [49*mm,117*mm])]
story += [section(3,'Proposed solution'),P('<b>Dante</b> links approved rules, facts, terms, and assets to the content that uses them. When a source changes, it surfaces connected items for review and shows recurring issues across review history.'),P('Findings cite their source. Dante distinguishes an unsupported claim from one that conflicts with approved facts; reviewers make the final call and can record exceptions.')]
story += [P('A demo scenario','SubX')]
scenario=[[cell('APPROVED FACT',True),cell('FACT CHANGES',True),cell('DANTE FLAGS FOR REVIEW',True)],[cell('Pro plan storage: 100 GB'),cell('New approved value: 200 GB'),cell('Find linked drafts that still state 100 GB; show the source version and route each item to a reviewer.')]]
story.append(table(scenario,[48*mm,48*mm,70*mm],True))
story.append(PageBreak())
story += [P('Published evidence','SectionX'),P('Lucidpress’s 2019 survey is a historical, self-reported snapshot - useful context, not a current industry benchmark.'),EvidenceCharts(),Spacer(1,1*mm),P('Respondents could select multiple effects. The figures describe perceptions, not measured financial losses.'),P('<b>Dante fills a practical gap:</b> it connects a team’s reviewed content to its approved sources, so a changed fact can lead to a targeted review.'),P('Source: Lucidpress, <i>The State of Brand Consistency</i> (2019). <link href="https://pubsecure.lucidpress.com/6e525791-56c1-4b3b-b9c4-e3db88727507/document.pdf">Open report</link>.','SmallX'),PageBreak()]
story += [section(4,'Complete product workflow')]
workflow=[('1. Add brand sources','Enter approved facts, rules, terms, and assets.'),('2. Approve versions','An administrator confirms each source and version.'),('3. Submit content','A creator submits text and selects its channel.'),('4. Review','Exact checks and source search find issues; AI helps explain them.'),('5. Resolve','Creators revise or request an exception; reviewers decide.'),('6. Keep history','Save findings, decisions, versions, and source links.'),('7. Recheck changes','When a source changes, list linked content for review.'),('8. Spot repeats','Group recurring findings and overrides over time.')]
story.append(table([[cell('Stage',True),cell('What happens',True)]]+[[cell(a),cell(b)] for a,b in workflow],[42*mm,124*mm]))

story += [section(5,'Main features planned')]
features=[('Versioned sources','Approved facts, rules, terms, assets, and their history.'),('Evidence-linked review','Flagged text, source, explanation, and suggested fix.'),('Content links','See which approved sources each item uses.'),('Change impact','Find older content affected by a source update.'),('Human approvals','Comments, revisions, exceptions, and decisions.'),('Drift view','Recurring findings and overrides with examples.'),('Access controls','Workspace permissions and clear AI data handling.')]
story.append(table([[cell('Feature',True),cell('Planned behaviour',True)]]+[[cell(a),cell(b)] for a,b in features],[53*mm,113*mm]))
story += [section(6,'Technology stack'),table([[cell('Layer',True),cell('Technology',True),cell('Purpose',True)],[cell('Web application'),cell('Next.js + TypeScript'),cell('Review interface, knowledge setup, impact view, and dashboard.')],[cell('UI'),cell('Tailwind CSS + shadcn/ui'),cell('Consistent components and responsive screens.')],[cell('Backend'),cell('Next.js Route Handlers'),cell('Authorization, review orchestration, versioning, and impact analysis.')],[cell('Database / Auth / Storage'),cell('Supabase: PostgreSQL, Supabase Auth, private Storage'),cell('Store workspace data, user roles, review history, and private uploads.')],[cell('AI'),cell('Gemini API or an available equivalent'),cell('Assist with rule extraction and semantic review; return structured, evidence-linked results.')],[cell('Search'),cell('PostgreSQL full-text search'),cell('Retrieve relevant approved sources for the MVP; add vector search only if needed.')],[cell('Charts / Hosting'),cell('Recharts; Vercel + Supabase'),cell('Visualise trends and deploy the demo.')]], [34*mm,52*mm,80*mm])]
story += [P('Reliability approach','SubX'),P('Use direct checks for exact terminology and structured facts. Use AI to help interpret wording, then verify that cited sources are approved and belong to the correct workspace. If the evidence is missing or unclear, send the item to a person.')]
story += [section(7,'Development plan across all three rounds')]
rounds=[('Round 1 - Proposal','Submit the concept, workflow, stack, and team plan.') ,('Round 2 - Prototype','Build brand sources, text review, approvals, and one change-impact scenario.') ,('Round 3 - Demo','Polish the 100 GB to 200 GB example; show affected content, evidence, reviewer action, and one measured drift pattern.')]
story.append(table([[cell('Round',True),cell('Planned work and outcome',True)]]+[[cell(a),cell(b)] for a,b in rounds],[48*mm,118*mm]))
story.append(P('Align round tasks with the official schedule and judging criteria.','SmallX'))

story += [section(8,'Expected impact'),P('Dante aims to catch stale or unsupported content earlier and cut time spent searching for current guidance. The prototype will show the affected draft, its source, and the reviewer decision; any performance claims will be measured before reporting.')]
story.append(KeepTogether([section(9,'Future scope'),bullet('Ingest PDF and DOCX guidelines with administrator approval.'),bullet('Check images for text, logo versions, and contrast.'),bullet('Track drift by campaign, channel, and team over time.'),bullet('Connect to publishing tools with configurable approval gates.'),bullet('Add multilingual rules, audit exports, and finer access controls.')]))
story += [section(10,'Team details'),P('<b>Chrollo</b> | CodeNexus | NSEC<br/>Team contact: Samriddha Chaudhury - samriddhachaudhury@gmail.com')]
teamrows=[[cell('Member',True),cell('Role',True)],[cell('Samriddha Chaudhury'),cell('Team Lead; Full Stack Developer')],[cell('Md Rizwaan Rahaman'),cell('Full Stack Developer')]]
story.append(table(teamrows,[67*mm,99*mm]))
story += [section(11,'Planned contributions'),P('<b>Samriddha Chaudhury, Team Lead:</b> product scope, backend, data model, source links, and change-impact logic.'),P('<b>Md Rizwaan Rahaman:</b> frontend screens, review workflow, dashboard, and demo content. Both will integrate, validate, and present the prototype.')]
doc=SimpleDocTemplate(OUT,pagesize=A4,rightMargin=22*mm,leftMargin=22*mm,topMargin=22*mm,bottomMargin=22*mm,title='Dante Hackathon Project Proposal',author='Team Chrollo')
doc.build(story,onFirstPage=header_footer,onLaterPages=header_footer)
print(OUT)
