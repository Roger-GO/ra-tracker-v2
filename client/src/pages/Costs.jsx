import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
} from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#9c27b0', '#2196f3', '#4caf50', '#ff9800', '#f44336', '#00bcd4'];

function Costs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30');
  const [data, setData] = useState({
    summary: {},
    byModel: [],
    byAgent: [],
    byDate: []
  });

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/costs?days=${dateRange}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      
      setData({
        summary: json.summary || {},
        byModel: json.by_model || [],
        byAgent: json.by_agent || [],
        byDate: json.by_date || []
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const { summary, byModel, byAgent, byDate } = data;

  // Transform data for charts
  const dateChartData = (byDate || []).slice(0, 30).map(d => ({
    date: new Date(d.period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: parseFloat(d.cost_total || 0)
  })).reverse();

  const modelPieData = (byModel || []).map(m => ({
    name: (m.model || '').split('/').pop() || 'Unknown',
    value: parseFloat(m.cost_total || 0)
  }));

  const agentBarData = (byAgent || []).slice(0, 10).map(a => ({
    name: a.name || 'Unknown',
    cost: parseFloat(a.cost_total || 0),
    tokens: a.total_tokens || 0
  }));

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Costs
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        OpenRouter costs breakdown
      </Typography>

      <Box sx={{ mb: 3 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Date Range</InputLabel>
          <Select
            value={dateRange}
            label="Date Range"
            onChange={(e) => setDateRange(e.target.value)}
          >
            <MenuItem value="7">Last 7 Days</MenuItem>
            <MenuItem value="14">Last 14 Days</MenuItem>
            <MenuItem value="30">Last 30 Days</MenuItem>
            <MenuItem value="90">Last 90 Days</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Stats Cards - Material Dashboard Style */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #e91e63 0%, #f48fb1 100%)',
            color: 'white',
            height: 120
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Total Spend</Typography>
              <Typography variant="h3" fontWeight={700}>${(summary.total_cost || 0).toFixed(2)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>USD</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)',
            color: 'white',
            height: 120
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>API Calls</Typography>
              <Typography variant="h3" fontWeight={700}>{(summary.request_count || 0).toLocaleString()}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>requests</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)',
            color: 'white',
            height: 120
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Total Tokens</Typography>
              <Typography variant="h3" fontWeight={700}>{((summary.total_tokens || 0) / 1000000).toFixed(2)}M</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>million</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)',
            color: 'white',
            height: 120
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Avg Cost/Call</Typography>
              <Typography variant="h3" fontWeight={700}>${((summary.total_cost || 0) / (summary.request_count || 1)).toFixed(4)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>per request</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts - Full Width */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card sx={{ height: 400 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>Daily Costs Trend</Typography>
              <ResponsiveContainer width="100%" height={330}>
                <LineChart data={dateChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Line 
                    type="monotone" 
                    dataKey="cost" 
                    stroke="#e91e63" 
                    strokeWidth={3}
                    dot={{ fill: '#e91e63' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card sx={{ height: 450 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>Cost by Model</Typography>
              <ResponsiveContainer width="100%" height={380}>
                <PieChart>
                  <Pie
                    data={modelPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={130}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={true}
                  >
                    {modelPieData.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card sx={{ height: 450 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>Cost by Agent</Typography>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={agentBarData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="cost" fill="#4caf50" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Costs;