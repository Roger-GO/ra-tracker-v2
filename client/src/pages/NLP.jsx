import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
} from '@mui/material';
import { TextFields, Psychology } from '@mui/icons-material';

function NLP() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        NLP Processing
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Natural language processing insights and analytics
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'primary.main', color: '#fff' }}>
                  <TextFields />
                </Box>
                <Typography variant="h6">Text Analysis</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Total documents processed: <strong>1,247</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Average sentiment score: <strong>0.73</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Entities extracted: <strong>4,521</strong>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'secondary.main', color: '#fff' }}>
                  <Psychology />
                </Box>
                <Typography variant="h6">Intent Recognition</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Total intents detected: <strong>892</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Top intent: <strong>query_information</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Accuracy: <strong>94.2%</strong>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default NLP;