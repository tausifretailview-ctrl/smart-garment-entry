import React, { forwardRef } from "react";
import { format } from "date-fns";
import { numberToWords } from "@/lib/utils";
import { ChequeFormat } from "@/hooks/useChequeFormats";

interface ChequePrintPreviewProps {
  payeeName: string;
  amount: number;
  chequeDate: Date;
  chequeFormat: ChequeFormat;
  showPreview?: boolean;
}

export const ChequePrintPreview = forwardRef<HTMLDivElement, ChequePrintPreviewProps>(
  ({ payeeName, amount, chequeDate, chequeFormat, showPreview = false }, ref) => {
    const mmToPx = (mm: number) => mm * 3.78; // 1mm ≈ 3.78px at 96dpi

    const formatDateParts = (date: Date, dateFormat: string) => {
      const dd = format(date, "dd");
      const mm = format(date, "MM");
      const yyyy = format(date, "yyyy");
      return { dd, mm, yyyy };
    };

    const { dd, mm, yyyy } = formatDateParts(chequeDate, chequeFormat.date_format);

    // Convert amount to words
    const amountInWords = numberToWords(amount);
    // Split into two lines if too long
    const maxCharsPerLine = 45;
    let line1 = amountInWords;
    let line2 = "";
    if (amountInWords.length > maxCharsPerLine) {
      const words = amountInWords.split(" ");
      let currentLine = "";
      for (const word of words) {
        if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
          currentLine = (currentLine + " " + word).trim();
        } else {
          if (!line2) {
            line1 = currentLine;
            line2 = word;
          } else {
            line2 += " " + word;
          }
        }
      }
      if (!line2) line1 = currentLine;
    }

    // Format amount with proper Indian grouping
    const formatAmount = (amt: number) => {
      return new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amt);
    };

    const containerStyle: React.CSSProperties = {
      width: `${mmToPx(chequeFormat.cheque_width_mm)}px`,
      height: `${mmToPx(chequeFormat.cheque_height_mm)}px`,
      position: "relative",
      fontFamily: "Arial, sans-serif",
      fontSize: `${chequeFormat.font_size_pt}pt`,
      backgroundColor: showPreview ? "#f5f5dc" : "transparent",
      border: showPreview ? "2px dashed #999" : "none",
      overflow: "hidden",
    };

    const commonTextStyle: React.CSSProperties = {
      position: "absolute",
      whiteSpace: "nowrap",
    };

    return (
      <div ref={ref} style={containerStyle}>
        {/* A/C Payee Only lines */}
        {chequeFormat.show_ac_payee && (
          <>
            <div
              style={{
                position: "absolute",
                top: `${mmToPx(3)}px`,
                left: `${mmToPx(8)}px`,
                transform: "rotate(-45deg)",
                transformOrigin: "left top",
              }}
            >
              <div style={{ borderTop: "1px solid black", width: "50px" }} />
              <div style={{ fontSize: "8pt", marginTop: "2px" }}>A/C PAYEE ONLY</div>
              <div style={{ borderTop: "1px solid black", width: "50px", marginTop: "2px" }} />
            </div>
          </>
        )}

        {/* Date fields - DD MM YYYY */}
        <div
          style={{
            ...commonTextStyle,
            top: `${mmToPx(chequeFormat.date_top_mm)}px`,
            left: `${mmToPx(chequeFormat.date_left_mm)}px`,
            display: "flex",
            gap: `${mmToPx(chequeFormat.date_spacing_mm)}px`,
            fontWeight: "bold",
          }}
        >
          <span>{dd}</span>
          <span>{mm}</span>
          <span>{yyyy}</span>
        </div>

        {/* Pay (Payee Name) */}
        <div
          style={{
            ...commonTextStyle,
            top: `${mmToPx(chequeFormat.name_top_mm)}px`,
            left: `${mmToPx(chequeFormat.name_left_mm)}px`,
            maxWidth: `${mmToPx(chequeFormat.name_width_mm)}px`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontWeight: "bold",
            textTransform: "uppercase",
          }}
        >
          {payeeName}
        </div>

        {/* Amount in Words - Line 1 */}
        <div
          style={{
            ...commonTextStyle,
            top: `${mmToPx(chequeFormat.words_top_mm)}px`,
            left: `${mmToPx(chequeFormat.words_left_mm)}px`,
            fontSize: `${chequeFormat.font_size_pt - 1}pt`,
          }}
        >
          {line1}
        </div>

        {/* Amount in Words - Line 2 */}
        {line2 && (
          <div
            style={{
              ...commonTextStyle,
              top: `${mmToPx(chequeFormat.words_top_mm + chequeFormat.words_line2_offset_mm)}px`,
              left: `${mmToPx(chequeFormat.words_left_mm)}px`,
              fontSize: `${chequeFormat.font_size_pt - 1}pt`,
            }}
          >
            {line2}
          </div>
        )}

        {/* Amount in Figures */}
        <div
          style={{
            ...commonTextStyle,
            top: `${mmToPx(chequeFormat.amount_top_mm)}px`,
            left: `${mmToPx(chequeFormat.amount_left_mm)}px`,
            fontWeight: "bold",
            fontSize: `${chequeFormat.font_size_pt + 1}pt`,
          }}
        >
          ★ {formatAmount(amount)} ★
        </div>

        {/* Preview overlay - bank name */}
        {showPreview && (
          <div
            style={{
              position: "absolute",
              bottom: "10px",
              right: "10px",
              fontSize: "10pt",
              color: "#666",
              opacity: 0.7,
            }}
          >
            {chequeFormat.bank_name}
          </div>
        )}
      </div>
    );
  }
);

ChequePrintPreview.displayName = "ChequePrintPreview";
