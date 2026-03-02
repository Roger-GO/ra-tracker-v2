import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Chip
} from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#9c27b0', '#2196f3', '#4caf50', '#ff9800', '#f44336', '#00bcd4', '#795548', '#607d8b'];

function Projects() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectStats, setProjectStats] = useState({ byCost: [], byTokens: [] });

  useEffect(() => {
    fetchProjectsData();
  }, []);

  const fetchProjectsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v2/projects');
      const json = await response.json();
      const data = json.data || json.projects || json || [];
      
      const projectsWithStatus = (Array.isArray(data) ? data : []).map((project, idx) => ({
        id: project.id || idx,
        name: project.name || 'Unknown Project',
        status: project.status || 'active',
        totalCost: parseFloat(project.total_cost || 0),
        totalTokens: parseInt(project.total_tokens || 0),
        taskCount: project.task_count || 0,
        sprintCount: project.sprint_count || 0
      }));

      setProjects(projectsWithStatus);
      setProjectStats({
        byCost: projectsWithStatus.map(p => ({
          name: (p.name || 'Unknown').length > 15 ? p.name.substring(0, 15) + '...' : p.name,
          cost: p.totalCost
        })),
        byTokens: projectsWithStatus.map(p => ({
          name: (p.name || 'Unknown').length > 15 ? p.name.substring(0, 15) + '...' : p.name,
          tokens: p.totalTokens
        }))
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'completed': return 'info';
      case 'planning': return 'default';
      case 'in_progress': return 'warning';
      default: return 'default';
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
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Manage and track your ongoing projects
      </Typography>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {projects.map((project) => (
          <Grid item xs={12} md={6} key={project.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6">{project.name}</Typography>
                  <Chip 
                    label={(project.status || 'active').replace('_', ' ')} 
                    color={getStatusColor(project.status)} 
                    size="small" 
                  />
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">Total Cost</Typography>
                    <Typography variant="h6" color="primary">${project.totalCost.toFixed(2)}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">Tokens</Typography>
                    <Typography variant="h6">{project.totalTokens.toLocaleString()}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">Tasks</Typography>
                    <Typography variant="h6">{project.taskCount}</Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Costs by Project</Typography>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={projectStats.byCost}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="cost" fill="#9c27b0">
                    {projectStats.byCost.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Tokens by Project</Typography>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={projectStats.byTokens}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => value.toLocaleString()} />
                  <Bar dataKey="tokens" fill="#2196f3">
                    {projectStats.byTokens.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Projects;