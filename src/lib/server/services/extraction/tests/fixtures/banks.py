# Generates made-up IDFC and SBI statements laid out like the banks' PDFs: python3 banks.py banks
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

out = sys.argv[1]
styles = getSampleStyleSheet()
body = styles["BodyText"]


def lines(*texts):
    return [Paragraph(t, body) for t in texts]


def table(rows, widths, spans=(), heading=1):
    t = Table(rows, colWidths=[w * mm for w in widths], repeatRows=heading)
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (-1, heading - 1), "Helvetica-Bold"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEBELOW", (0, heading - 1), (-1, heading - 1), 0.5, colors.black),
        ("LINEBELOW", (0, heading), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        *[("SPAN", (0, r), (-1, r)) for r in spans],
        *[("TEXTCOLOR", (0, r), (-1, r), colors.darkred) for r in spans],
    ]))
    return t


def build(name, story):
    SimpleDocTemplate(f"{out}/{name}", pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm).build(story)


# The current layout: a date per row and DR or CR in a column of its own.
build("idfc-card.pdf", [
    *lines("Credit Card Statement", "Statement Date 18/May/2026 to 17/Jun/2026", "A N OTHER",
           "Total Amount Due 6,612.40 DR", "YOUR TRANSACTIONS", "Card Number: XXXX 0000"),
    Spacer(1, 4 * mm),
    table([
        ["Date", "Details", "EMI Eligibility", "Forex Transactions", "Total Amount", "(Rs)"],
        ["Purchases, EMIs & Other Debits", "", "", "", "", ""],
        ["24/05/2026", "Corner Pharmacy, Sampletown", "Convert", "", "1,522.41", "DR"],
        ["28/05/2026", "EXAMPLE HOSTING GMBH, BERLIN", "Convert", "USD 50.45", "4,833.21", "DR"],
        ["02/06/2026", "City Cafe, Sampletown", "", "", "256.78", "DR"],
        ["Payments & Other Credits", "", "", "", "", ""],
        ["18/05/2026", "UPI/000000000001/180526/", "", "", "7,470.56", "CR"],
    ], [24, 62, 24, 28, 26, 12], spans=(1, 5)),
    Spacer(1, 6 * mm),
    *lines("IDFC FIRST Bank Credit Cards"),
])

# The layout until 2026: headings over two lines, a short date, and DR or CR after the amount.
build("idfc-card-2026.pdf", [
    *lines("Credit Card Statement", "18/Feb/2026 - 17/Mar/2026", "A N OTHER", "Statement Summary",
           "Total Amount Due = 4,147.78 DR", "YOUR TRANSACTIONS"),
    Spacer(1, 4 * mm),
    table([
        ["Transaction", "Transaction Details", "EMI", "FX", "", "Amount"],
        ["Date", "", "Eligibility", "Transactions", "", "(In INR)"],
        ["Card Number: XXXX 0000", "", "", "", "", ""],
        ["Purchases, EMIs & Other Debits", "", "", "", "", ""],
        ["28 Feb 26", "EXAMPLE HOSTING GMBH, BERLIN", "Convert", "USD 34.36", "", "3,126.34 DR"],
        ["03 Mar 26", "Corner Pharmacy, Sampletown", "Convert", "", "", "2,290.95 DR"],
        ["Payments & Other Credits", "", "", "", "", ""],
        ["18 Feb 26", "UPI/000000000002/180226/", "", "", "", "1,269.51 CR"],
    ], [34, 52, 30, 30, 12, 28], spans=(2, 3, 6), heading=2),
    Spacer(1, 6 * mm),
    *lines("IDFC FIRST Bank Credit Cards"),
])

# Descriptions wrap onto rows of their own, and an empty amount is a dash.
sbi_header = ["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"]


def sbi(date, description, debit, credit, balance, *more):
    return [[date, date, description, "-", debit, credit, balance], *[["", "", m, "", "", "", ""] for m in more]]


widths = [20, 20, 56, 26, 20, 20, 24]
build("sbi-savings.pdf", [
    *lines("STATEMENT OF ACCOUNT", "Master A N OTHER State Bank of India", "Account Number : 00000000000",
           "Product : Savings Account", "Statement From : 01-02-2026 to 30-04-2026"),
    Spacer(1, 4 * mm),
    table([sbi_header,
           *sbi("16/02/2026", "DEP TFR UPI/CR/000000000001/SA", "-", "10,000.00", "60,000.00",
                "P/EXAMPLE/sample.pay/Self", "AT 00000 SAMPLE NAGAR"),
           *sbi("16/02/2026", "WDL TFR UPI/DR/000000000002/SA", "3,000.00", "-", "57,000.00", "SAMPLE NAGAR"),
           *sbi("08/03/2026", "ATM WDL ATM CASH 000000000003", "5,000.00", "-", "52,000.00"),
           ], widths),
    PageBreak(),
    table([sbi_header,
           *sbi("25/03/2026", "INTEREST CREDIT", "-", "312.00", "52,312.00"),
           *sbi("27/04/2026", "POS ATM PURCH OTHPG 000000000004", "876.64", "-", "51,435.36", "CORNER PHARMACY"),
           ], widths),
    Spacer(1, 6 * mm),
    *lines("This is a computer generated statement and does not require a signature."),
])
