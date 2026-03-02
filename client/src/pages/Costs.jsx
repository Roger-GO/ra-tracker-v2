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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#9c27b0', '#2196f3', '#4caf50', '#ff9800', '#f44336', '#00bcd4'];

function Costs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30');
  const [costsData, setCostsData] = useState({ summary: {}, byDay: [], byProject: [], byAgent: [] });

  useEffect(() => {
    fetchCostsData();
  }, [dateRange]);

  const fetchCostsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/costs?days=${dateRange}`);
      if (!response.ok) throw new Error('Failed to fetch costs');
      const data = await response.json();
      
      // Transform data for charts
      const byDay = Array.isArray(data) ? data.map(item => ({
        date: new Date(item.date || item.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cost: parseFloat(item.total_cost || item.cost || 0)
      })) : [];

      // Get project costs
      const projectsRes = await fetch('/api/v2/projects');
      const projectsData = await projectsRes.json();
      const byProject = (projectsData || []).map(p => ({
        name: p.name || 'Unknown',
        cost: parseFloat(p.total_cost || 0)
      })).slice(0, 6);

      // Get agent costs
      const agentsRes = await fetch('/api/v2/agents');
      const agentsData = await agentsRes.json();
      const byAgent = (agentsData || []).map(a => ({
        name: a.name || 'Unknown',
        cost: parseFloat(a.total_cost || 0)
      })).slice(0, 8);

      // Calculate summary
      const totalCost = byDay.reduce((sum, d) => sum + d.cost, 0);
      const totalCalls = byDay.reduce((sum, d) => sum + (d.calls || 0), 0);
      const avgCost = totalCalls > 0 ? totalCost / totalCalls : 0;

      setCostsData({
        summary: { totalCost, totalCalls, avgCost },
        byDay,
        byProject,
        byAgent
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

  const { summary, byDay, byProject, byAgent } = costsData;

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Costs
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Track and analyze your AI agent costs
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

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Total Costs</Typography>
              <Typography variant="h3" fontWeight={600} color="primary">
                ${summary.totalCost?.toFixed(2) || '0.00'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Last {dateRange} days
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>API Calls</Typography>
              <Typography variant="h3" fontWeight={600} color="secondary">
                {summary.totalCalls?.toLocaleString() || '0'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total calls
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Avg Cost/Call</Typography>
              <Typography variant="h3" fontWeight={600} color="info.main">
                ${summary.avgCost?.toFixed(4) || '0.0000'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Per request
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Cost Over Time</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => [`$${value.toFixed(2)}`, 'Cost']} />
                  <Area type="monotone" dataKey="cost" stroke="#9c27b0" fill="#9c27b0" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Costs by Project</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={byProject}
                    dataKey="cost"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {byProject.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Costs by Agent</Typography>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byAgent} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
              <Bar dataKey="cost" fill="#2196f3" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Costs;