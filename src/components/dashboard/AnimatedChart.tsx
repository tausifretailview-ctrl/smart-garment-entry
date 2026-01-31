import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { TrendingUp } from "lucide-react";

interface ChartData {
  name: string;
  [key: string]: string | number;
}

interface AnimatedChartProps {
  title: string;
  data: ChartData[];
  type?: "line" | "bar" | "area";
  dataKeys: { key: string; color: string; name: string }[];
  height?: number;
}

export const AnimatedChart = ({ 
  title, 
  data, 
  type = "line", 
  dataKeys,
  height = 300 
}: AnimatedChartProps) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-elevated">
          <p className="font-semibold text-popover-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-bold">{entry.value.toLocaleString()}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 10, right: 30, left: 0, bottom: 0 },
    };

    const chartConfig = (
      <>
        <defs>
          {dataKeys.map((item, index) => (
            <linearGradient key={item.key} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={item.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={item.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis 
          dataKey="name" 
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis 
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value.toLocaleString()}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          wrapperStyle={{ paddingTop: "16px", fontSize: "12px" }}
          iconType="circle"
          iconSize={8}
        />
      </>
    );

    switch (type) {
      case "bar":
        return (
          <BarChart {...commonProps}>
            {chartConfig}
            {dataKeys.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                fill={item.color}
                radius={[4, 4, 0, 0]}
                animationDuration={800}
                name={item.name}
              />
            ))}
          </BarChart>
        );
      case "area":
        return (
          <AreaChart {...commonProps}>
            {chartConfig}
            {dataKeys.map((item, index) => (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                stroke={item.color}
                fill={`url(#gradient-${index})`}
                strokeWidth={2}
                animationDuration={1000}
                name={item.name}
              />
            ))}
          </AreaChart>
        );
      default:
        return (
          <LineChart {...commonProps}>
            {chartConfig}
            {dataKeys.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                stroke={item.color}
                strokeWidth={2}
                dot={{ fill: item.color, r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: item.color, strokeWidth: 2, fill: "hsl(var(--card))" }}
                animationDuration={1000}
                name={item.name}
              />
            ))}
          </LineChart>
        );
    }
  };

  return (
    <Card className="border border-border bg-card shadow-elevated overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-card-foreground">
          <div className="p-1.5 rounded-md bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={height}>
          {renderChart()}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};