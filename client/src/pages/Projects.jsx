import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  LinearProgress,
} from '@mui/material';

const projects = [
  { id: 1, name: 'RA Tracker v2', status: 'in_progress', progress: 65, tasks: 18, completed: 12 },
  { id: 2, name: 'API Integration', status: 'in_progress', progress: 40, tasks: 10, completed: 4 },
  { id: 3, name: 'Dashboard UI', status: 'completed', progress: 100, tasks: 15, completed: 15 },
  { id: 4, name: 'Analytics Engine', status: 'planning', progress: 10, tasks: 20, completed: 2 },
];

function Projects() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Projects
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Manage and track your ongoing projects
      </Typography>
      
      <Grid container spacing={3}>
        {projects.map((project) => (
          <Grid item xs={12} md={6} key={project.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">{project.name}</Typography>
                  <Typography
                    variant="body2"
                    color={project.status === 'completed' ? 'success.main' : 'text.secondary'}
                  >
                    {project.status.replace('_', ' ')}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Progress
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {project.completed}/{project.tasks} tasks
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={project.progress}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default Projects;