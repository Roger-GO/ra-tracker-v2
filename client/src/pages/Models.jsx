import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
} from '@mui/material';
import { ModelTraining, Speed, Memory } from '@mui/icons-material';

const models = [
  { id: 1, name: 'gpt-4', provider: 'OpenAI', calls: 12450, cost: '$456.80', status: 'active' },
  { id: 2, name: 'claude-3-opus', provider: 'Anthropic', calls: 8320, cost: '$389.25', status: 'active' },
  { id: 3, name: 'gemini-pro', provider: 'Google', calls: 6780, cost: '$124.50', status: 'active' },
  { id: 4, name: 'llama-3-70b', provider: 'Meta', calls: 4520, cost: '$89.30', status: 'idle' },
  { id: 5, name: 'mistral-large', provider: 'Mistral', calls: 3200, cost: '$65.40', status: 'active' },
];

function Models() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Models
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        AI models and their usage statistics
      </Typography>
      
      <Grid container spacing={3}>
        {models.map((model) => (
          <Grid item xs={12} md={6} key={model.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box>
                    <Typography variant="h6">{model.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {model.provider}
                    </Typography>
                  </Box>
                  <Chip
                    label={model.status}
                    color={model.status === 'active' ? 'success' : 'default'}
                    size="small"
                  />
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Speed fontSize="small" color="action" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">Calls</Typography>
                        <Typography variant="body1" fontWeight={600}>{model.calls.toLocaleString()}</Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Memory fontSize="small" color="action" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">Cost</Typography>
                        <Typography variant="body1" fontWeight={600}>{model.cost}</Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">% Usage</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {Math.round((model.calls / 36170) * 100)}%
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default Models;