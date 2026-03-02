import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function Projects() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/costs?days=30');
      const json = await res.json();
      // Group by agent (as proxy for projects since we don't have explicit projects)
      const byAgent = json.by_agent || [];
      setProjects(byAgent.map(a => ({
        name: a.name || 'Unknown',
        cost: parseFloat(a.cost_total || 0),
        tokens: a.total_tokens || 0,
        calls: a.request_count || 0
      })));
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

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Projects
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Cost breakdown by agent (proxy for projects)
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {projects.slice(0, 4).map((project, idx) => (
          <Grid item xs={12} sm={6} md={3} key={idx}>
            <Card sx={{ 
              background: 'linear-gradient(135deg, #673ab7 0%, #9575cd 100%)',
              color: 'white',
              height: 120
            }}>
              <CardContent>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>{project.name}</Typography>
                <Typography variant="h4" fontWeight={700}>${project.cost.toFixed(2)}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {project.calls} calls • {(project.tokens / 1000).toFixed(1)}K tokens
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ height: 500 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={600} gutterBottom>All Projects/Agents</Typography>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={projects.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
              <Bar dataKey="cost" fill="#673ab7" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Projects;