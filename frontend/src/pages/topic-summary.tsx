import React from 'react';
import { useStore } from '../hooks/useStore';
import LoadingSpinner from '../components/LoadingSpinner';
import { get } from '../lib/api';
import { useEffect } from 'react';

export default function TopicSummary() {
    const setTopicSummary = useStore((s) => s.setTopicSummary);
    const topicSummary = useStore((s) => s.topicSummary);

    useEffect(() => {
        async function fetchSummary() {
            const data = await get<{ topics: any }>('/api/topic-summary');
            // flatten to the shape expected by the store
            const flat = Object.fromEntries(
                Object.entries(data.topics).map(([topic, vals]) => [
                    topic,
                    {
                        easy: vals.easy,
                        medium: vals.medium,
                        hard: vals.hard,
                        total: vals.easy + vals.medium + vals.hard,
                    },
                ])
            );
            setTopicSummary(flat);
        }
        fetchSummary();
    }, [setTopicSummary]);

    if (!topicSummary) return <LoadingSpinner />;

    return (
        <section>
            <h1 className="text-3xl font-bold mb-6">Topic Summary</h1>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(topicSummary).map(([topic, data]) => (
                    <div key={topic} className="bg-white/10 rounded p-4 backdrop-blur-sm">
                        <h3 className="text-xl font-semibold mb-2">{topic}</h3>
                        <div className="grid grid-cols-2 gap-1 text-sm">
                            <span>Easy</span><span>{data.easy}</span>
                            <span>Medium</span><span>{data.medium}</span>
                            <span>Hard</span><span>{data.hard}</span>
                            <span>Total</span><span>{data.total}</span>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
