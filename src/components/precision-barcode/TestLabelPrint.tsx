import { forwardRef } from "react";

interface TestLabelPrintProps {
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
}

export const TestLabelPrint = forwardRef<HTMLDivElement, TestLabelPrintProps>(
  ({ width, height, xOffset, yOffset }, ref) => {
    return (
      <div ref={ref} className="precision-print-area">
        <div
          style={{
            width: `${width}mm`,
            height: `${height}mm`,
            position: "relative",
            overflow: "hidden",
            boxSizing: "border-box",
            background: "white",
          }}
        >
          {/* Red vertical center line */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: "0.2mm",
              background: "red",
              transform: "translateX(-50%)",
            }}
          />
          {/* Red horizontal center line */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: "0.2mm",
              background: "red",
              transform: "translateY(-50%)",
            }}
          />
          {/* Black "L" bracket at (0,0) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "5mm",
              height: "0.4mm",
              background: "black",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "0.4mm",
              height: "5mm",
              background: "black",
            }}
          />
          {/* CENTER text */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -100%)",
              fontSize: "2.5mm",
              fontWeight: 700,
              fontFamily: "sans-serif",
              color: "red",
              letterSpacing: "0.5mm",
            }}
          >
            CENTER
          </div>
          {/* Dimensions text at bottom */}
          <div
            style={{
              position: "absolute",
              bottom: "1mm",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: "1.8mm",
              fontFamily: "monospace",
              color: "#666",
            }}
          >
            {width}×{height}mm &nbsp; offset({xOffset}, {yOffset})
          </div>
        </div>
      </div>
    );
  }
);

TestLabelPrint.displayName = "TestLabelPrint";
