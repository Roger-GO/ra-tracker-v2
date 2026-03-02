import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
} from '@mui/material';

function Costs() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Costs
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Track and analyze your AI agent costs
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Total Costs</Typography>
              <Typography variant="h3" fontWeight={600} color="primary">
                $1,284.50
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This month
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>API Calls</Typography>
              <Typography variant="h3" fontWeight={600} color="secondary">
                45,832
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
                $0.028
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Per request
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Costs;