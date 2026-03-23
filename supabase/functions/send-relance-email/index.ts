import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { actionId, to, subject, body } = await req.json();

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // TODO: Configure email sending (Resend, SMTP, etc.)
    // For now, log the email and return success
    console.log(`[RELANCE EMAIL] To: ${to}, Subject: ${subject}, ActionId: ${actionId}`);
    console.log(`Body: ${body.substring(0, 200)}...`);

    // In production, integrate with Resend:
    // const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    // const res = await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ from: 'relance@bramial.pt', to, subject, text: body }),
    // });

    return new Response(JSON.stringify({ success: true, message: 'Email logged (configure SMTP/Resend for actual sending)' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
