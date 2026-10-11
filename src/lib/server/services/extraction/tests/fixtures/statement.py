# Generates the synthetic statement PDFs the PDF adapter tests read.
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.pdfencrypt import StandardEncryption

out, password = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None)
styles = getSampleStyleSheet()
small = styles["BodyText"].clone("small", fontSize=8, leading=10)
header = ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"]
rows, balance = [], 100000.0
for day in range(1, 41):
    d = f"{(day - 1) % 28 + 1:02d}/{8 + (day - 1) // 28:02d}/26"
    deposit = day % 7 == 0
    amount = 50000.0 if deposit else 120.5 * day
    balance += amount if deposit else -amount
    narration = f"UPI-MERCHANT NUMBER {day}-OKAXIS-PAYMENT FOR ORDER {1000 + day}" if day % 5 == 0 else f"UPI-SHOP {day}"
    rows.append([d, Paragraph(narration, small), f"{400000 + day:012d}", d,
                 "" if deposit else f"{amount:,.2f}", f"{amount:,.2f}" if deposit else "", f"{balance:,.2f}"])
table = Table([header] + rows, colWidths=[16*mm, 62*mm, 24*mm, 16*mm, 24*mm, 22*mm, 26*mm], repeatRows=1)
table.setStyle(TableStyle([
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
    ("ALIGN", (4, 1), (-1, -1), "RIGHT"),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=10*mm, rightMargin=10*mm,
                        encrypt=StandardEncryption(password, canPrint=1) if password else None)
doc.build([Paragraph("HDFC BANK Ltd.", styles["Title"]),
           Paragraph("Statement of account for Account No 50100000000000, 01/08/26 to 12/09/26", styles["BodyText"]),
           Spacer(1, 6*mm), table])
