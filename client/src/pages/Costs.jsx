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
      // Fetch costs
      const response = await fetch(`/api/v2/costs?days=${dateRange}`);
      if (!response.ok) throw new Error('Failed to fetch costs');
      const data = await response.json();
      const summary = data.summary || {};
      
      // Transform data for charts - handle by_model format
      const byModel = data.by_model || [];
      const byDay = byModel.slice(0, 14).map((item, idx) => ({
        date: `Day ${idx + 1}`,
        cost: parseFloat(item.cost_total || item.cost || 0)
      }));

      // Get project costs
      const projectsRes = await fetch('/api/v2/projects');
      const projectsJson = await projectsRes.json();
      const projects = projectsJson.data || projectsJson.projects || projectsJson || [];
      const byProject = (Array.isArray(projects) ? projects : []).slice(0, 6).map(p => ({
        name: p.name || 'Unknown',
        cost: parseFloat(p.total_cost || 0)
      }));

      // Get agent costs
      const agentsRes = await fetch('/api/v2/agents');
      const agentsJson = await agentsRes.json();
      const agents = agentsJson.data || agentsJson.agents || agentsJson || [];
      const byAgent = (Array.isArray(agents) ? agents : []).slice(0, 8).map(a => ({
        name: a.name || 'Unknown',
        cost: parseFloat(a.total_cost || 0)
      }));

      setCostsData({
        summary,
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
                ${summary.total_cost?.toFixed(2) || '0.00'}
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
                {summary.request_count?.toLocaleString() || '0'}
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
                ${((summary.total_cost || 0) / (summary.request_count || 1)).toFixed(4)}
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
              <Typography variant="h6" gutterBottom>Cost by Model</Typography>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={byModel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="model" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="cost_total" fill="#9c27b0" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Costs by Project</Typography>
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={byProject}
                    dataKey="cost"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
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
          <ResponsiveContainer width="100%" height={350}>
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