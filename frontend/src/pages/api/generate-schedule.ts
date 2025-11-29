import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { topicDays, problems, topicOrder } = req.body;
        console.log('Generating schedule for:', topicDays);

        // Simple Round-Robin Schedule Generation
        const schedule: any[] = [];
        let currentDay = 1;

        // Group by topic
        const byTopic: Record<string, any[]> = {};
        problems.forEach((p: any) => {
            const t = p.topic || 'Uncategorized';
            if (!byTopic[t]) byTopic[t] = [];
            byTopic[t].push(p);
        });

        // Sort topics based on user preference
        const sortedTopics = Object.keys(byTopic).sort((a, b) => {
            const orderA = topicOrder?.[a] || 999;
            const orderB = topicOrder?.[b] || 999;
            return orderA - orderB;
        });

        // Iterate topics
        for (const topic of sortedTopics) {
            const topicProbs = byTopic[topic];
            const days = parseInt(topicDays?.[topic]) || 3;
            const probsPerDay = Math.ceil(topicProbs.length / days);

            for (let i = 0; i < topicProbs.length; i += probsPerDay) {
                schedule.push({
                    day: currentDay++,
                    topic: topic,
                    problems: topicProbs.slice(i, i + probsPerDay)
                });
            }
        }

        res.status(200).json({
            message: 'Schedule generated successfully',
            schedule: schedule
        });

    } catch (error: any) {
        console.error('Error generating schedule:', error);
        res.status(500).json({ error: 'Failed to generate schedule' });
    }
}
