import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, memoryStore, checkDbConnection } from "@/lib/db";
import { isMockMode, getTenantId } from "@/lib/config";
import { ProposalContent, RFPInput, Tenant } from "@/types";
import { getEnv } from "@/lib/env";

// docx library imports
import {
  Document as DocxDocument,
  Packer as DocxPacker,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  WidthType,
  PageBreak,
  Header,
  Footer,
} from "docx";

// pptxgenjs library imports
import pptxgen from "pptxgenjs";

// puppeteer-core for PDF export
import puppeteer from "puppeteer-core";

export const dynamic = "force-dynamic";

// Standard Arabic layout helpers for docx
const createArabicParagraph = (text: string, options: { bold?: boolean; size?: number; color?: string; align?: any } = {}) => {
  return new Paragraph({
    bidirectional: true,
    alignment: options.align || AlignmentType.RIGHT,
    spacing: { before: 120, after: 120 },
    children: [
      new TextRun({
        text: text,
        font: "Arial",
        bold: options.bold || false,
        size: options.size || 24, // 12pt
        color: options.color || "111827",
        rightToLeft: true,
      }),
    ],
  });
};

const createHeading = (text: string, level: number) => {
  const size = level === 1 ? 32 : level === 2 ? 28 : 24;
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text: text,
        font: "Arial",
        bold: true,
        size: size,
        color: "16A34A", // Courseat Green
        rightToLeft: true,
      }),
    ],
  });
};

// Word export generator
async function generateDocx(rfp: RFPInput, content: ProposalContent, tenant: Tenant) {
  const tableBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
  };

  const headerCellProperties = {
    shading: { fill: "16A34A" },
    borders: tableBorder,
  };

  // COVER PAGE INFO TABLE
  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorder,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [createArabicParagraph(rfp.client_name, { bold: true })],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "F9FAFB" },
            children: [createArabicParagraph("الجهة المستفيدة", { bold: true, color: "16A34A" })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [createArabicParagraph(rfp.title, { bold: true })],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "F9FAFB" },
            children: [createArabicParagraph("البرنامج التدريبي", { bold: true, color: "16A34A" })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [createArabicParagraph(`${rfp.duration_days} أيام (تقديم: ${rfp.delivery_mode === "in-person" ? "حضوري" : rfp.delivery_mode === "online" ? "عن بعد" : "هجين"})`)],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "F9FAFB" },
            children: [createArabicParagraph("مدة وأسلوب التدريب", { bold: true, color: "16A34A" })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [createArabicParagraph(new Date().toLocaleDateString("ar-SA"))],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "F9FAFB" },
            children: [createArabicParagraph("تاريخ تقديم العرض", { bold: true, color: "16A34A" })],
          }),
        ],
      }),
    ],
  });

  // TIMELINE TABLE
  const timelineRows = [
    new TableRow({
      children: [
        new TableCell({ ...headerCellProperties, width: { size: 70, type: WidthType.PERCENTAGE }, children: [createArabicParagraph("النشاط والمحاور التدريبية", { bold: true, color: "FFFFFF", align: AlignmentType.CENTER })] }),
        new TableCell({ ...headerCellProperties, width: { size: 30, type: WidthType.PERCENTAGE }, children: [createArabicParagraph("الفترة الزمنية", { bold: true, color: "FFFFFF", align: AlignmentType.CENTER })] }),
      ],
    }),
    ...(content.timeline || []).map((t) => (
      new TableRow({
        children: [
          new TableCell({ children: [createArabicParagraph(t.activity)] }),
          new TableCell({ children: [createArabicParagraph(t.week, { align: AlignmentType.CENTER })] }),
        ],
      })
    )),
  ];

  const timelineTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorder,
    rows: timelineRows,
  });

  // FINANCIAL TABLE (IF COMBINED/FINANCIAL)
  let financialTable: Table | Paragraph | null = null;
  const showFinancial = rfp.proposal_type !== "technical" && content.financial;
  
  if (showFinancial && content.financial) {
    const isAnyPriceNull = content.financial.breakdown.some((b) => b.unit_price === null);

    const breakdownRows = [
      new TableRow({
        children: [
          new TableCell({ ...headerCellProperties, width: { size: 25, type: WidthType.PERCENTAGE }, children: [createArabicParagraph("الإجمالي (ريال)", { bold: true, color: "FFFFFF", align: AlignmentType.CENTER })] }),
          new TableCell({ ...headerCellProperties, width: { size: 20, type: WidthType.PERCENTAGE }, children: [createArabicParagraph("سعر الوحدة (ريال)", { bold: true, color: "FFFFFF", align: AlignmentType.CENTER })] }),
          new TableCell({ ...headerCellProperties, width: { size: 15, type: WidthType.PERCENTAGE }, children: [createArabicParagraph("الكمية", { bold: true, color: "FFFFFF", align: AlignmentType.CENTER })] }),
          new TableCell({ ...headerCellProperties, width: { size: 40, type: WidthType.PERCENTAGE }, children: [createArabicParagraph("البند التدريبي / الخدمات المقدمة", { bold: true, color: "FFFFFF", align: AlignmentType.RIGHT })] }),
        ],
      }),
      ...content.financial.breakdown.map((item) => (
        new TableRow({
          children: [
            new TableCell({ children: [createArabicParagraph(item.total !== null ? `${item.total}` : "يحدد لاحقاً", { align: AlignmentType.CENTER })] }),
            new TableCell({ children: [createArabicParagraph(item.unit_price !== null ? `${item.unit_price}` : "يحدد لاحقاً", { align: AlignmentType.CENTER })] }),
            new TableCell({ children: [createArabicParagraph(`${item.quantity}`, { align: AlignmentType.CENTER })] }),
            new TableCell({ children: [createArabicParagraph(item.item)] }),
          ],
        })
      )),
    ];

    // Totals rows
    if (content.financial.total_before_vat !== null) {
      breakdownRows.push(
        new TableRow({
          children: [
            new TableCell({ children: [createArabicParagraph(`${content.financial.total_before_vat}`, { bold: true, align: AlignmentType.CENTER })] }),
            new TableCell({ columnSpan: 3, shading: { fill: "F9FAFB" }, children: [createArabicParagraph("المجموع الفرعي (غير شامل ضريبة القيمة المضافة)", { bold: true })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [createArabicParagraph(`${content.financial.vat_amount}`, { align: AlignmentType.CENTER })] }),
            new TableCell({ columnSpan: 3, shading: { fill: "F9FAFB" }, children: [createArabicParagraph("ضريبة القيمة المضافة (15%)", { bold: true })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [createArabicParagraph(`${content.financial.total_after_vat}`, { bold: true, color: "16A34A", align: AlignmentType.CENTER })] }),
            new TableCell({ columnSpan: 3, shading: { fill: "F9FAFB" }, children: [createArabicParagraph("المجموع الكلي (شامل ضريبة القيمة المضافة)", { bold: true })] }),
          ],
        })
      );
    }

    financialTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorder,
      rows: breakdownRows,
    });
  }

  // BUILD THE DOCUMENT SECTIONS
  const docChildren: any[] = [
    // Cover Page Design
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 } }),
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: tenant.name, font: "Arial", bold: true, size: 36, color: "16A34A" }),
      ],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 } }),
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "عرض تدريبي فني ومالي متكامل", font: "Arial", bold: true, size: 48, color: "111827" }),
      ],
    }),
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [
        new TextRun({ text: `لتنفيذ برنامج: ${rfp.title}`, font: "Arial", size: 32, color: "374151" }),
      ],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200 } }),
    infoTable,
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 } }),
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "الرقم الضريبي / الترخيص: " + (tenant.license_number || "TVTC-12345"), font: "Arial", size: 20, color: "6B7280" }),
      ],
    }),
    new PageBreak(),

    // Section 1: Executive Summary
    createHeading("1. الملخص التنفيذي", 1),
    createArabicParagraph(content.executive_summary),

    // Section 2: About the Institute
    createHeading("2. نبذة عن المعهد", 1),
    createArabicParagraph(content.about_institute),

    // Section 3: Methodology
    createHeading("3. منهجية التدريب", 1),
    createArabicParagraph(content.methodology?.approach || ""),
    
    createHeading("مراحل تنفيذ البرنامج التدريبي:", 2),
  ];

  // Add methodology phases
  (content.methodology?.phases || []).forEach((p) => {
    docChildren.push(
      createArabicParagraph(`المرحلة ${p.number}: ${p.title} (${p.duration})`, { bold: true, color: "16A34A" }),
      createArabicParagraph(p.description),
      createArabicParagraph("الأهداف والمخرجات المتوقعة:", { bold: true, size: 20 })
    );
    p.objectives.forEach((obj) => {
      docChildren.push(createArabicParagraph(`- ${obj}`));
    });
  });

  docChildren.push(
    createHeading("الموارد والحقائب التدريبية:", 2),
    ... (content.methodology?.tools_and_resources || []).map((t) => createArabicParagraph(`* ${t}`))
  );

  docChildren.push(
    new PageBreak(),
    // Section 4: Timeline
    createHeading("4. الجدول الزمني لتوزيع المحاور", 1),
    timelineTable
  );

  if (showFinancial && content.financial) {
    const isAnyPriceNull = content.financial.breakdown.some((b) => b.unit_price === null);

    docChildren.push(
      new PageBreak(),
      // Section 5: Financial Offer
      createHeading("5. العرض المالي والرسوم", 1)
    );

    if (isAnyPriceNull) {
      docChildren.push(
        createArabicParagraph("⚠ تنبيه هام: الأسعار التفصيلية والمجموع النهائي غير محددة بعد في النظام. يرجى مراجعة إدارة الحسابات لتعبئة هذا العرض مالياً قبل التقديم الرسمي للعميل.", { bold: true, color: "D97706" })
      );
    }

    docChildren.push(
      financialTable!,
      createArabicParagraph("شروط وطريقة الدفع والسداد:", { bold: true, color: "16A34A" }),
      createArabicParagraph(content.financial.payment_terms)
    );
  }

  docChildren.push(
    createHeading("6. البنود العامة والأحكام والشروط", 1),
    createArabicParagraph(content.terms_and_conditions)
  );

  const doc = new DocxDocument({
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                bidirectional: true,
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: `${tenant.name} | عرض برنامج: ${rfp.title}`,
                    font: "Arial",
                    size: 16,
                    color: "9CA3AF",
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                bidirectional: true,
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "سري للغاية - وثيقة خاصة بـ " + rfp.client_name,
                    font: "Arial",
                    size: 16,
                    color: "9CA3AF",
                  }),
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  return await DocxPacker.toBuffer(doc);
}

// PowerPoint export generator
function generatePptx(rfp: RFPInput, content: ProposalContent, tenant: Tenant): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  
  // Slide 1: Cover Slide
  const slide1 = pptx.addSlide();
  slide1.background = { color: "111827" }; // Dark slate bg
  
  slide1.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.5,
    fill: { color: "16A34A" },
  });

  // Client target banner
  slide1.addText(tenant.name, {
    x: 1.0,
    y: 1.5,
    w: 8.0,
    h: 0.5,
    fontSize: 24,
    color: "16A34A",
    bold: true,
    fontFace: "Arial",
    align: "right",
    rtl: true,
  });

  slide1.addText(rfp.title, {
    x: 1.0,
    y: 2.2,
    w: 8.0,
    h: 1.2,
    fontSize: 36,
    color: "FFFFFF",
    bold: true,
    fontFace: "Arial",
    align: "right",
    rtl: true,
  });

  slide1.addText(`عرض فني ومالي لشركة: ${rfp.client_name}`, {
    x: 1.0,
    y: 3.5,
    w: 8.0,
    h: 0.5,
    fontSize: 20,
    color: "9CA3AF",
    fontFace: "Arial",
    align: "right",
    rtl: true,
  });

  // Slide 2: Executive Summary
  const slide2 = pptx.addSlide();
  slide2.addText("1. الملخص التنفيذي", { x: 0.5, y: 0.5, w: 9.0, h: 0.6, fontSize: 24, color: "16A34A", bold: true, align: "right", rtl: true });
  slide2.addText(content.executive_summary, { x: 0.5, y: 1.3, w: 9.0, h: 4.5, fontSize: 16, color: "374151", align: "right", rtl: true });

  // Slide 3: Methodology Overview
  const slide3 = pptx.addSlide();
  slide3.addText("2. المنهجية والأسلوب التدريبي", { x: 0.5, y: 0.5, w: 9.0, h: 0.6, fontSize: 24, color: "16A34A", bold: true, align: "right", rtl: true });
  slide3.addText(content.methodology?.approach || "", { x: 0.5, y: 1.2, w: 9.0, h: 1.5, fontSize: 15, color: "374151", align: "right", rtl: true });

  // Phase boxes
  (content.methodology?.phases || []).forEach((p, idx) => {
    if (idx >= 3) return; // Cap at 3 phases for slide formatting
    const boxX = 6.8 - idx * 3.1;
    
    // Header shape
    slide3.addShape("roundRect", {
      x: boxX,
      y: 3.0,
      w: 2.8,
      h: 2.5,
      fill: { color: "F3F4F6" },
      line: { color: "E5E7EB", width: 1 },
    });

    slide3.addText(`المرحلة ${p.number}\n${p.title}`, {
      x: boxX,
      y: 3.1,
      w: 2.8,
      h: 0.6,
      fontSize: 14,
      bold: true,
      color: "16A34A",
      align: "center",
      rtl: true,
    });

    slide3.addText(p.description.substring(0, 150), {
      x: boxX + 0.1,
      y: 3.8,
      w: 2.6,
      h: 1.6,
      fontSize: 11,
      color: "4B5563",
      align: "right",
      rtl: true,
    });
  });

  // Slide 4: One slide per phase (details)
  (content.methodology?.phases || []).forEach((p) => {
    const slidePhase = pptx.addSlide();
    slidePhase.addText(`مرحلة التدريب ${p.number}: ${p.title}`, { x: 0.5, y: 0.5, w: 9.0, h: 0.6, fontSize: 24, color: "16A34A", bold: true, align: "right", rtl: true });
    slidePhase.addText(`المدة المقررة: ${p.duration}`, { x: 0.5, y: 1.1, w: 9.0, h: 0.4, fontSize: 16, color: "6B7280", align: "right", rtl: true });
    
    slidePhase.addText(p.description, { x: 0.5, y: 1.6, w: 9.0, h: 1.2, fontSize: 15, color: "374151", align: "right", rtl: true });

    // Objectives list
    slidePhase.addText("أهداف ومخرجات المرحلة الأساسية:", { x: 0.5, y: 2.9, w: 9.0, h: 0.4, fontSize: 16, bold: true, color: "111827", align: "right", rtl: true });
    
    const objText = p.objectives.map((obj) => `• ${obj}`).join("\n\n");
    slidePhase.addText(objText, { x: 0.5, y: 3.4, w: 9.0, h: 2.2, fontSize: 14, color: "4B5563", align: "right", rtl: true });
  });

  // Slide 5: Timeline
  const slide5 = pptx.addSlide();
  slide5.addText("3. الجدول الزمني وتوزيع الأيام", { x: 0.5, y: 0.5, w: 9.0, h: 0.6, fontSize: 24, color: "16A34A", bold: true, align: "right", rtl: true });

  const timelineRows = [
    [
      { text: "النشاط التدريبي والمحاور المغطاة", options: { bold: true, fill: "16A34A", color: "FFFFFF" } },
      { text: "اليوم / الفترة", options: { bold: true, fill: "16A34A", color: "FFFFFF", align: "center" } }
    ]
  ];

  (content.timeline || []).forEach((t) => {
    timelineRows.push([
      { text: t.activity, options: { align: "right" } },
      { text: t.week, options: { align: "center" } }
    ]);
  });

  slide5.addTable(timelineRows, {
    x: 0.5,
    y: 1.3,
    w: 9.0,
    colW: [7.0, 2.0],
    border: { color: "E5E7EB", width: 1 },
    fontSize: 12,
  });

  // Slide 6: Financial Offer (if applicable)
  if (rfp.proposal_type !== "technical" && content.financial) {
    const slide6 = pptx.addSlide();
    slide6.addText("4. العرض المالي والرسوم المقترحة", { x: 0.5, y: 0.5, w: 9.0, h: 0.6, fontSize: 24, color: "16A34A", bold: true, align: "right", rtl: true });

    const isAnyPriceNull = content.financial.breakdown.some((b) => b.unit_price === null);

    if (isAnyPriceNull) {
      slide6.addText("⚠ تنبيه: الأسعار والمجاميع المالية لم يتم تحديدها بعد وتتطلب مراجعة.", {
        x: 0.5,
        y: 1.1,
        w: 9.0,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: "D97706",
        align: "right",
        rtl: true,
      });
    }

    const financialRows = [
      [
        { text: "المجموع الكلي (ريال)", options: { bold: true, fill: "16A34A", color: "FFFFFF" } },
        { text: "سعر الوحدة (ريال)", options: { bold: true, fill: "16A34A", color: "FFFFFF" } },
        { text: "الكمية", options: { bold: true, fill: "16A34A", color: "FFFFFF" } },
        { text: "الخدمة / البند التدريبي", options: { bold: true, fill: "16A34A", color: "FFFFFF" } }
      ]
    ];

    content.financial.breakdown.forEach((item) => {
      financialRows.push([
        { text: item.total !== null ? `${item.total}` : "يحدد لاحقاً", options: { align: "center" } },
        { text: item.unit_price !== null ? `${item.unit_price}` : "يحدد لاحقاً", options: { align: "center" } },
        { text: `${item.quantity}`, options: { align: "center" } },
        { text: item.item, options: { align: "right" } }
      ]);
    });

    slide6.addTable(financialRows, {
      x: 0.5,
      y: 1.6,
      w: 9.0,
      colW: [2.0, 2.0, 1.0, 4.0],
      border: { color: "E5E7EB", width: 1 },
      fontSize: 11,
    });

    slide6.addText(`شروط السداد: ${content.financial.payment_terms}`, {
      x: 0.5,
      y: 4.8,
      w: 9.0,
      h: 0.8,
      fontSize: 12,
      color: "4B5563",
      align: "right",
      rtl: true,
    });
  }

  // Slide 7: Closing slide
  const slide7 = pptx.addSlide();
  slide7.background = { color: "111827" };
  
  slide7.addText("نشكر لكم اهتمامكم وثقتكم", {
    x: 1.0,
    y: 2.0,
    w: 8.0,
    h: 0.8,
    fontSize: 32,
    color: "16A34A",
    bold: true,
    align: "center",
    rtl: true,
  });

  slide7.addText(`معهد التدريب: ${tenant.name}\nالهاتف: ${tenant.phone || ""}\nالبريد الإلكتروني: ${tenant.email || ""}\nالعنوان: ${tenant.address || ""}`, {
    x: 1.0,
    y: 3.0,
    w: 8.0,
    h: 1.8,
    fontSize: 16,
    color: "FFFFFF",
    align: "center",
    rtl: true,
  });

  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

// HTML formatter for PDF printing
const renderHtmlProposal = (rfp: RFPInput, content: ProposalContent, tenant: Tenant): string => {
  const showFinancial = rfp.proposal_type !== "technical" && content.financial;
  
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${rfp.title}</title>
      <style>
        body { font-family: 'Arial', sans-serif; color: #111827; background-color: #ffffff; padding: 40px; margin: 0; line-height: 1.6; }
        .page { width: 100%; max-width: 800px; margin: 0 auto; box-sizing: border-box; }
        .cover-page { text-align: center; padding-top: 100px; height: 100vh; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; page-break-after: always; }
        .cover-title { font-size: 32px; font-weight: bold; color: #111827; margin-top: 50px; }
        .cover-subtitle { font-size: 22px; color: #4B5563; margin-top: 15px; }
        .institute-name { font-size: 24px; font-weight: bold; color: #16A34A; }
        .info-table { width: 100%; border-collapse: collapse; margin-top: 80px; }
        .info-table td { border: 1px solid #E5E7EB; padding: 12px; font-size: 14px; }
        .info-table td.label { background-color: #F9FAFB; font-weight: bold; width: 35%; color: #16A34A; }
        h1 { font-size: 22px; color: #16A34A; border-bottom: 2px solid #DCFCE7; padding-bottom: 8px; margin-top: 40px; }
        h2 { font-size: 16px; color: #111827; margin-top: 25px; }
        p { font-size: 14px; color: #374151; text-align: justify; }
        .phase { border-right: 3px solid #16A34A; padding-right: 15px; margin-bottom: 25px; }
        .phase-title { font-weight: bold; color: #16A34A; font-size: 15px; }
        .phase-duration { font-size: 12px; color: #6B7280; margin-bottom: 5px; }
        table.data-table { width: 100%; border-collapse: collapse; margin: 25px 0; }
        table.data-table th { background-color: #16A34A; color: #ffffff; padding: 10px; font-size: 14px; border: 1px solid #16A34A; text-align: center; }
        table.data-table td { border: 1px solid #E5E7EB; padding: 10px; font-size: 13px; text-align: center; }
        table.data-table td.text-right { text-align: right; }
        .alert-warning { background-color: #FEF3C7; border-right: 4px solid #D97706; padding: 12px; color: #92400E; font-size: 13px; font-weight: bold; border-radius: 4px; margin-bottom: 20px; }
        @media print {
          body { padding: 0; }
          .cover-page { height: 100%; padding-top: 150px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Cover Page -->
        <div class="cover-page">
          <div>
            <div class="institute-name">${tenant.name}</div>
            <div class="cover-title">عرض تقديم برنامج تدريبي متكامل</div>
            <div class="cover-subtitle">${rfp.title}</div>
          </div>
          <table class="info-table">
            <tr>
              <td class="label">العميل المستهدف</td>
              <td>${rfp.client_name}</td>
            </tr>
            <tr>
              <td class="label">نوع البرنامج</td>
              <td>${rfp.training_type}</td>
            </tr>
            <tr>
              <td class="label">مدة وتوزيع التدريب</td>
              <td>${rfp.duration_days} يوم/أيام (${rfp.delivery_mode === "in-person" ? "حضوري" : rfp.delivery_mode === "online" ? "عن بعد" : "هجين"})</td>
            </tr>
            <tr>
              <td class="label">تاريخ التقديم</td>
              <td>${new Date().toLocaleDateString("ar-SA")}</td>
            </tr>
          </table>
          <div style="font-size: 12px; color: #9CA3AF; margin-bottom: 40px;">
            سري للغاية - وثيقة خاصة بـ ${rfp.client_name}
          </div>
        </div>

        <!-- Executive Summary -->
        <h1>1. الملخص التنفيذي</h1>
        <p>${content.executive_summary.replace(/\n/g, "<br>")}</p>

        <!-- About Institute -->
        <h1>2. نبذة عن المعهد</h1>
        <p>${content.about_institute.replace(/\n/g, "<br>")}</p>

        <!-- Methodology -->
        <h1>3. منهجية وأسلوب التدريب</h1>
        <p>${content.methodology?.approach || ""}</p>
        
        <h2>مراحل تنفيذ المشروع التدريبي:</h2>
        ${(content.methodology?.phases || []).map((p) => `
          <div class="phase">
            <div class="phase-title">المرحلة ${p.number}: ${p.title}</div>
            <div class="phase-duration">المدة: ${p.duration}</div>
            <p>${p.description}</p>
            <div style="font-size: 13px; font-weight: bold; margin-top: 5px;">مخرجات وأهداف المرحلة:</div>
            <ul style="font-size: 13px; color: #4B5563; margin-top: 5px; padding-right: 20px;">
              ${p.objectives.map((obj) => `<li>${obj}</li>`).join("")}
            </ul>
          </div>
        `).join("")}

        <h2>الأدوات والمواد العلمية:</h2>
        <ul style="font-size: 14px; color: #374151; padding-right: 20px;">
          ${(content.methodology?.tools_and_resources || []).map((t) => `<li>${t}</li>`).join("")}
        </ul>

        <!-- Timeline -->
        <h1>4. الخطة الزمنية للبرنامج</h1>
        <table class="data-table">
          <thead>
            <tr>
              <th>الفترة / اليوم</th>
              <th style="width: 75%;">المحاور والأنشطة التدريبية</th>
            </tr>
          </thead>
          <tbody>
            ${(content.timeline || []).map((t) => `
              <tr>
                <td>${t.week}</td>
                <td style="text-align: right; padding-right: 15px;">${t.activity}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <!-- Financial Section -->
        ${showFinancial && content.financial ? `
          <h1>5. العرض المالي ورسوم الخدمة</h1>
          ${content.financial.breakdown.some((b) => b.unit_price === null) ? `
            <div class="alert-warning">
              ⚠ تنبيه هام: الأسعار المالية غير مؤكدة بعد وتتطلب مراجعة مع قسم المالية لتحديثها.
            </div>
          ` : ""}
          <table class="data-table">
            <thead>
              <tr>
                <th>البند التدريبي / الخدمة</th>
                <th style="width: 15%;">الكمية</th>
                <th style="width: 20%;">سعر الوحدة</th>
                <th style="width: 20%;">المجموع الكلي</th>
              </tr>
            </thead>
            <tbody>
              ${content.financial.breakdown.map((item) => `
                <tr>
                  <td class="text-right" style="padding-right: 15px;">${item.item}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit_price !== null ? `${item.unit_price} ريال` : "يحدد لاحقاً"}</td>
                  <td>${item.total !== null ? `${item.total} ريال` : "يحدد لاحقاً"}</td>
                </tr>
              `).join("")}
              ${content.financial.total_before_vat !== null ? `
                <tr style="font-weight: bold; background-color: #F9FAFB;">
                  <td colspan="3" class="text-right" style="padding-right: 15px;">المجموع الفرعي (غير شامل ضريبة القيمة المضافة)</td>
                  <td>${content.financial.total_before_vat} ريال</td>
                </tr>
                <tr>
                  <td colspan="3" class="text-right" style="padding-right: 15px;">ضريبة القيمة المضافة (15%)</td>
                  <td>${content.financial.vat_amount} ريال</td>
                </tr>
                <tr style="font-weight: bold; color: #16A34A; background-color: #DCFCE7;">
                  <td colspan="3" class="text-right" style="padding-right: 15px;">المجموع الكلي (شامل ضريبة القيمة المضافة)</td>
                  <td>${content.financial.total_after_vat} ريال</td>
                </tr>
              ` : ""}
            </tbody>
          </table>
          <h2>شروط وأحكام الدفع:</h2>
          <p>${content.financial.payment_terms}</p>
        ` : ""}

        <!-- Terms and conditions -->
        <h1>6. الشروط والأحكام العامة</h1>
        <p>${content.terms_and_conditions.replace(/\n/g, "<br>")}</p>
      </div>
      <!-- Auto trigger print for PDF export fallback -->
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);
        };
      </script>
    </body>
    </html>
  `;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const format = searchParams.get("format"); // docx, pptx, pdf
    const tenantId = searchParams.get("tenant_id") || getTenantId();

    if (!id || !format) {
      return new NextResponse("Missing parameters: id and format are required", { status: 400 });
    }

    const isDbConnected = !isMockMode() && (await checkDbConnection());
    let proposal: GeneratedProposal | null = null;
    let tenant: Tenant = {
      id: tenantId,
      name: "معهد التميز للتدريب",
      license_number: "TVTC-12345",
      phone: "+966501234567",
      email: "info@excellence-training.sa",
      address: "الرياض، المملكة العربية السعودية",
      created_at: new Date().toISOString(),
    };

    // Load data
    if (!isDbConnected) {
      proposal = memoryStore.generatedProposals.get(id) || null;
      const memTenant = memoryStore.tenants.get(tenantId);
      if (memTenant) tenant = memTenant;
    } else {
      const dbRow = await queryOne(
        tenantId,
        "SELECT id, tenant_id, rfp_data, draft_content, review_status, created_at FROM generated_proposals WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );
      if (dbRow) {
        proposal = {
          id: dbRow.id,
          tenant_id: dbRow.tenant_id,
          rfp_data: typeof dbRow.rfp_data === "string" ? JSON.parse(dbRow.rfp_data) : dbRow.rfp_data,
          draft_content: typeof dbRow.draft_content === "string" ? JSON.parse(dbRow.draft_content) : dbRow.draft_content,
          review_status: dbRow.review_status,
          compliance_score: dbRow.compliance_score,
          compliance_checklist: dbRow.compliance_checklist,
          reference_proposal_ids: dbRow.reference_proposal_ids,
          created_at: dbRow.created_at,
        };
      }

      const dbTenant = await queryOne(
        tenantId,
        "SELECT id, name, name_en, logo_url, license_number, phone, email, address FROM tenants WHERE id = $1",
        [tenantId]
      );
      if (dbTenant) tenant = dbTenant;
    }

    if (!proposal) {
      return new NextResponse("Proposal not found", { status: 404 });
    }

    // Update status to exported
    if (!isDbConnected) {
      proposal.review_status = "exported";
      memoryStore.generatedProposals.set(id, proposal);
    } else {
      await query(tenantId, "UPDATE generated_proposals SET review_status = 'exported' WHERE id = $1", [id]);
    }

    const rfp = proposal.rfp_data;
    const content = proposal.draft_content;

    // FORMAT 1: WORD (.docx)
    if (format === "docx") {
      const buffer = await generateDocx(rfp, content, tenant);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="Proposal_${proposal.id}.docx"`,
        },
      });
    }

    // FORMAT 2: POWERPOINT (.pptx)
    if (format === "pptx") {
      const buffer = await generatePptx(rfp, content, tenant);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename="Presentation_${proposal.id}.pptx"`,
        },
      });
    }

    // FORMAT 3: PDF
    if (format === "pdf") {
      const htmlContent = renderHtmlProposal(rfp, content, tenant);
      const env = getEnv();

      // Attempt server-side print via Chromium if Puppeteer path is configured
      if (env.PUPPETEER_EXECUTABLE_PATH) {
        try {
          const browser = await puppeteer.launch({
            executablePath: env.PUPPETEER_EXECUTABLE_PATH,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          });
          const page = await browser.newPage();
          await page.setContent(htmlContent);
          const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" },
          });
          await browser.close();

          return new NextResponse(pdfBuffer, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="Proposal_${proposal.id}.pdf"`,
            },
          });
        } catch (error) {
          console.error("Puppeteer PDF generation failed. Falling back to HTML printing.", error);
        }
      }

      // Fallback: If chromium is not active on host, return the print-friendly HTML page!
      // Users can print/save as PDF instantly from their browser.
      return new NextResponse(htmlContent, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    return new NextResponse("Invalid format type", { status: 400 });
  } catch (error: any) {
    console.error("Error exporting document:", error);
    return new NextResponse(`Export failed: ${error.message}`, { status: 500 });
  }
}
