// File: app/api/draft/route.js (FINAL AND CORRECT)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function buildArgumentText(dossier, selectedArgs) {
    let body = "This is an action under the Washington Public Records Act, RCW 42.56.\n\n";
    
    const denials = dossier.filter(v => v.type === 'CONSTRUCTIVE_DENIAL');
    const logFailures = dossier.filter(v => v.type === 'PRIVILEGE_LOG_FAILURE');
    const highRisk = dossier.filter(v => v.type === 'HIGH_RISK_VIOLATION');

    if (selectedArgs.includes('bad_faith') && denials.length > 0) {
        body += `The Agency has engaged in a pattern of bad faith non-compliance, evidenced by ${denials.length} separate constructive denials of Requestor's valid PRA requests:\n\n`;
        denials.forEach(denial => {
            body += `\t•  On or about ${denial.date}, the Agency failed to provide a timely response regarding "${denial.description}"\n`;
        });
        body += "\nThis pattern is not mere oversight; it is a calculated strategy of evasion that warrants sanctions under RCW 42.56.550.\n\n";
    }

    if (selectedArgs.includes('privilege_waiver') && logFailures.length > 0) {
        body += `Furthermore, the Agency's claims of exemption are unsupported. By failing to provide a compliant privilege log on at least ${logFailures.length} occasions, the Agency has flagrantly abandoned its right to assert these exemptions through its non-compliance. The Court should order immediate disclosure of all records withheld on these grounds.\n\n`;
    }

    if (selectedArgs.includes('in_camera_review') && highRisk.length > 0) {
        body += `Given the ${highRisk.length} high-risk violations identified, including improper redactions and questionable withholdings, the Court cannot rely on the Agency's assertions. It is imperative that the Court conduct an in camera review of the withheld records to determine the validity of the claimed exemptions.\n\n`;
    }
    
    // === THIS IS THE CORRECTED LINE ===
    body += "For the foregoing reasons, Plaintiff seeks penalties of up to $100 per day per record under RCW 42.56.550(4), costs, and such other relief as the Court deems just.";
    
    return body;
}

export async function POST(request) {
    try {
        const { caseId, arguments: selectedArgs, tone } = await request.json();

        const host = request.headers.get('host');
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const dossierRes = await fetch(`${protocol}://${host}/api/matters/${caseId}/dossier`);
        if (!dossierRes.ok) throw new Error("Failed to fetch dossier");
        const dossier = await dossierRes.json();
        
        const { data: templateBlob, error: downloadError } = await supabase.storage
            .from('case-files')
            .download('pleading_template.docx');
        if (downloadError) throw new Error("Template not found: " + downloadError.message);

        const templateBuffer = await templateBlob.arrayBuffer();
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        const renderData = {
            court_name: "SUPERIOR COURT OF WASHINGTON",
            jurisdiction: "FOR KING COUNTY",
            plaintiff_name: "BRANDON KAPP",
            defendant_name: "WASHINGTON STATE DEPARTMENT OF VETERANS AFFAIRS",
            case_number: "[CASE NUMBER]",
            document_title: "COMPLAINT AND PETITION FOR PENALTIES UNDER RCW 42.56.550(4)",
            body_section: buildArgumentText(dossier, selectedArgs),
            date: new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date()),
            signature_block: `Respectfully submitted,\n\n/s/ Brandon Kapp\nBrandon Kapp, Plaintiff Pro Se\n3112 Wrangler Dr\nEllensburg, WA 98926\nPhone: (619) 517-6069\nEmail: b-kapp@outlook.com`,
            certificate_of_service: `CERTIFICATE OF SERVICE\n\nI hereby certify that on this day, I caused the foregoing document to be served on the following parties via the method indicated:\n\n[OPPOSING COUNSEL NAME]\n[ADDRESS]\n[EMAIL]\n[X] By Email\n[ ] By Legal Messenger`
        };

        doc.render(renderData);

        const finalBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: "DEFLATE" });

        return new NextResponse(finalBuffer, {
            status: 200,
            headers: {
                "Content-Disposition": `attachment; filename="Complaint_${caseId}_Final.docx"`,
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
        });

    } catch (error) {
        console.error("FATAL ERROR in /api/draft:", error);
        return new NextResponse(JSON.stringify({ message: error.message }), { status: 500 });
    }
}
