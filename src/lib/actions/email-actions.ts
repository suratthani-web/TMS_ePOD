"use server"

import { Resend } from 'resend';
import nodemailer from 'nodemailer';

// Initialize Resend conditionally
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export interface EmailAttachment {
    filename: string;
    path?: string; // URL
    content?: string; // Base64 string or HTML content
}

interface SendBillingEmailProps {
    from?: string;
    to: string;
    cc?: string; // Comma separated or single email
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
}

// Display name shown in the recipient's inbox. Taken from SMTP_FROM ("Name <addr>") so
// every e-mail shows the same sender name — a bare branch address used to appear as
// just "suratthani@…" while mails without a branch showed "DD Transport".
const SENDER_NAME = (process.env.SMTP_FROM?.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] || process.env.SENDER_NAME || 'DRouteMind').trim()

function formatSender(addr: string): string {
    const a = addr.trim()
    if (!a || a.includes('<')) return a
    return `"${SENDER_NAME}" <${a}>`
}

export async function sendBillingEmail({ from, to, cc, subject, html, attachments }: SendBillingEmailProps) {
    let smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    let smtpUser = process.env.SMTP_USER;
    let smtpPass = process.env.SMTP_PASS;

    // Dynamically check if the sender email/branch has its own App Password in Master_Branches
    if (from) {
        try {
            const { createAdminClient } = await import('@/utils/supabase/server')
            const supabase = createAdminClient()
            const { data: branch } = await supabase
                .from('Master_Branches')
                .select('Email, Smtp_Host, Smtp_User, Smtp_Pass')
                .or(`Email.eq.${from},Branch_ID.eq.${from}`)
                .maybeSingle()
            
            if (branch?.Smtp_Pass) {
                smtpHost = branch.Smtp_Host || 'smtp.gmail.com'
                smtpUser = branch.Smtp_User || branch.Email || from
                smtpPass = branch.Smtp_Pass
            }
        } catch { /* ignore */ }
    }

    const senderEmail = formatSender(from || process.env.SMTP_FROM || process.env.DEFAULT_SENDER_EMAIL || smtpUser || '');
    const ccList = cc ? cc.split(',').map(e => e.trim()).filter(Boolean) : undefined;

    // 1. Try Custom SMTP Transport if configured
    if (smtpHost && smtpUser && smtpPass) {
        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465, // true for 465, false for other ports
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            });

            const mailOptions = {
                from: senderEmail,
                to: to,
                cc: ccList,
                subject: subject,
                html: html,
                attachments: attachments?.map(att => ({
                    filename: att.filename,
                    path: att.path,
                    content: att.content
                }))
            };

            const info = await transporter.sendMail(mailOptions);
            return { success: true, data: info };
        } catch (smtpErr: unknown) {
            const errMessage = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
            console.error("[SMTP Send Error]", errMessage);
            return { success: false, error: `SMTP Error: ${errMessage}` };
        }
    }

    // 2. Fallback to Resend API if configured
    if (resend) {
        try {
            // Resend delivery sender rule
            const deliverySender = process.env.RESEND_VERIFIED_FROM || `${SENDER_NAME} <onboarding@resend.dev>`;
            const replyToAddress = from || undefined;

            const { data, error } = await resend.emails.send({
                from: deliverySender,
                to: [to],
                cc: ccList,
                replyTo: replyToAddress,
                subject: subject,
                html: html,
                attachments: attachments
            });

            if (error) {
                console.error("[Resend Email Action Error]", error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            return { success: false, error: message };
        }
    }

    return { 
        success: false, 
        error: "ยังไม่ได้ตั้งค่าระบบส่งอีเมลฝั่งเซิร์ฟเวอร์ (SMTP หรือ RESEND_API_KEY) — คุณสามารถใช้ออปชัน 'เปิดในโปรแกรมอีเมล (Mail App)' เพื่อส่งตรงจาก Outlook / Gmail ในเครื่องได้ทันที" 
    };
}

export async function sendDangerZoneAlert({ plate, driverName, zoneName, timestamp, recipient }: { plate: string, driverName: string, zoneName: string, timestamp: string, recipient: string }) {
    const subject = `⚠️ ALERT: Vehicle ${plate} entered Danger Zone: ${zoneName}`;
    const html = `
        <div style="font-family: sans-serif; padding: 20px; border: 4px solid #ef4444; border-radius: 20px; background-color: #fef2f2;">
            <h1 style="color: #ef4444; margin-top: 0;">⚠️ DANGER ZONE ALERT</h1>
            <p style="font-size: 18px; font-weight: bold;">Detection Details:</p>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #fee2e2;"><strong>Vehicle Plate:</strong></td>
                    <td style="padding: 8px; border-bottom: 1px solid #fee2e2;">${plate}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #fee2e2;"><strong>Driver Name:</strong></td>
                    <td style="padding: 8px; border-bottom: 1px solid #fee2e2;">${driverName}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #fee2e2;"><strong>Zone Name:</strong></td>
                    <td style="padding: 8px; border-bottom: 1px solid #fee2e2;">${zoneName}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #fee2e2;"><strong>Timestamp:</strong></td>
                    <td style="padding: 8px; border-bottom: 1px solid #fee2e2;">${timestamp}</td>
                </tr>
            </table>
            <p style="margin-top: 20px; color: #7f1d1d; font-style: italic;">Please check the live monitoring dashboard for more details.</p>
        </div>
    `;

    return sendBillingEmail({
        to: recipient,
        subject,
        html
    });
}
