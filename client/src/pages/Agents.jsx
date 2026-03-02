import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
} from '@mui/material';
import { SmartToy, CheckCircle, Schedule, Error } from '@mui/icons-material';

const agents = [
  { id: 1, name: 'Code Agent', status: 'active', tasks: 124, runtime: '2d 4h' },
  { id: 2, name: 'Research Agent', status: 'active', tasks: 89, runtime: '1d 8h' },
  { id: 3, name: 'Data Agent', status: 'idle', tasks: 56, runtime: '12h' },
  { id: 4, name: 'Web Agent', status: 'error', tasks: 23, runtime: '4h' },
];

const getStatusColor = (status) => {
  switch (status) {
    case 'active': return 'success';
    case 'idle': return 'default';
    case 'error': return 'error';
    default: return 'default';
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'active': return <CheckCircle fontSize="small" />;
    case 'idle': return <Schedule fontSize="small" />;
    case 'error': return <Error fontSize="small" />;
    default: return null;
  }
};

function Agents() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Agents
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Monitor your AI agents and their activities
      </Typography>
      
      <Grid container spacing={3}>
        {agents.map((agent) => (
          <Grid item xs={12} md={6} key={agent.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'primary.main', color: '#fff' }}>
                    <SmartToy />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6">{agent.name}</Typography>
                    <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Tasks: {agent.tasks}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Runtime: {agent.runtime}
                      </Typography>
                    </Box>
                  </Box>
                  <Chip
                    icon={getStatusIcon(agent.status)}
                    label={agent.status}
                    color={getStatusColor(agent.status)}
                    size="small"
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

export default Agents;