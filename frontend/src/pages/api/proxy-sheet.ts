import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        let fetchUrl = url;
        if (url.includes('docs.google.com/spreadsheets')) {
            if (!url.includes('/export')) {
                fetchUrl = url.replace(/\/edit.*$/, '/export?format=xlsx');
                if (fetchUrl === url && !url.endsWith('xlsx')) {
                    fetchUrl = `${url.replace(/\/$/, '')}/export?format=xlsx`;
                }
            }
        }

        const response = await fetch(fetchUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch sheet: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');

        res.status(200).json({ data: base64 });
    } catch (error: any) {
        console.error('Proxy sheet error:', error);
        res.status(500).json({ error: error.message });
    }
}
