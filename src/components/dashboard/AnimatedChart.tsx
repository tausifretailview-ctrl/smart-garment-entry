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
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-elevated">
          <p className="font-semibold text-foreground mb-2">{label}</p>
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
              <stop offset="5%" stopColor={item.color} stopOpacity={0.8} />
              <stop offset="95%" stopColor={item.color} stopOpacity={0.1} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis 
          dataKey="name" 
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis 
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value.toLocaleString()}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          wrapperStyle={{ paddingTop: "20px" }}
          iconType="circle"
        />
      </>
    );

    switch (type) {
      case "bar":
        return (
          <BarChart {...commonProps}>
            {chartConfig}
            {dataKeys.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                fill={`url(#gradient-${index})`}
                radius={[8, 8, 0, 0]}
                animationDuration={1000}
                animationBegin={index * 100}
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
                animationDuration={1500}
                animationBegin={index * 100}
                name={item.name}
              />
            ))}
          </AreaChart>
        );
      default:
        return (
          <LineChart {...commonProps}>
            {chartConfig}
            {dataKeys.map((item, index) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                stroke={item.color}
                strokeWidth={3}
                dot={{ fill: item.color, r: 4 }}
                activeDot={{ r: 6, stroke: item.color, strokeWidth: 2 }}
                animationDuration={1500}
                animationBegin={index * 100}
                name={item.name}
              />
            ))}
          </LineChart>
        );
    }
  };

  return (
    <div className="group relative animate-fade-in">
      {/* Gradient Border Effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-secondary to-accent rounded-2xl opacity-0 group-hover:opacity-100 blur-sm transition-all duration-500" />
      
      <Card className="relative border-2 border-transparent group-hover:border-primary/20 transition-all duration-500 group-hover:shadow-elevated overflow-hidden">
        {/* Shimmer Effect */}
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        
        <CardHeader className="relative">
          <CardTitle className="text-lg font-display font-bold flex items-center gap-3 group-hover:text-primary transition-colors duration-300">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 group-hover:scale-110 transition-transform duration-300">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            {title}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="relative">
          <ResponsiveContainer width="100%" height={height}>
            {renderChart()}
          </ResponsiveContainer>
          
          {/* Animated Bottom Bar */}
          <div className="mt-4 h-1 w-0 group-hover:w-full bg-gradient-to-r from-primary via-secondary to-accent rounded-full transition-all duration-500" />
        </CardContent>
        
        {/* Corner Accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </Card>
    </div>
  );
};