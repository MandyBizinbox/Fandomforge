const UPDATED_DATE = "17 July 2026";
const UPDATED_AT = "2026-07-17";
const SUPPORT_EMAIL = "help@fandomforge.co.za";

function policy(title, summary, content) {
  return {
    platform_name: "FandomForge",
    title,
    summary,
    updated_at: UPDATED_AT,
    content: `<p><strong>Last updated:</strong> ${UPDATED_DATE}</p>${content}`,
  };
}

export const LOCAL_POLICIES = {
  terms_and_conditions: policy(
    "Customer Terms",
    "The terms that apply when customers browse, order and pay through FandomForge.",
    `
      <h2>1. About FandomForge</h2>
      <p>FandomForge is operated in South Africa by FandomForge (Pty) Ltd, registration number 2024/705706/07. The platform enables creators, clubs, schools and organisations to offer approved made-to-order merchandise through branded online stores.</p>

      <h2>2. Accepting these terms</h2>
      <p>By creating an account, placing an order or using the platform, you agree to these Customer Terms and the applicable Privacy, Shipping and Returns Policies. If you do not agree, do not use the platform or place an order.</p>

      <h2>3. Product information</h2>
      <p>Product descriptions, size information, mockups and colours are practical guides. Small variations may occur because of screen settings, garment batches, manufacturing methods and supplier availability. Customers must check the selected product, size, colour, quantity, personalisation and delivery details before payment.</p>

      <h2>4. Made-to-order products</h2>
      <p>Most FandomForge products are made after payment is confirmed. Production may begin soon after payment, which can limit the ability to cancel or change an order. Personalised or made-to-order goods may not qualify for a change-of-mind return unless required by law or approved under the Returns Policy.</p>

      <h2>5. Prices and payment</h2>
      <p>Prices are shown in South African rand unless stated otherwise. Available payment methods are shown at checkout and may be provided by third-party payment processors. An order is accepted once payment is confirmed and FandomForge issues an order confirmation.</p>

      <h2>6. Order review</h2>
      <p>FandomForge may reject, pause or cancel an order where payment cannot be verified, fraud is suspected, the product is unavailable, submitted content is prohibited, or fulfilment is not reasonably possible. Where FandomForge cancels a paid order, the appropriate refund process will be followed.</p>

      <h2>7. Production and delivery</h2>
      <p>Most paid orders are produced within 2 to 3 business days. Standard courier delivery usually takes a further 3 to 4 business days after production and dispatch. These are estimates rather than guarantees. Remote areas, peak periods, supplier issues, courier disruptions and incomplete delivery information may extend the timeline.</p>

      <h2>8. Cancellations, returns and refunds</h2>
      <p>Cancellation requests must be submitted before production begins. Damaged, faulty or incorrect items should be reported within 7 days after delivery or collection with the order number and supporting photographs. Returns, replacements and refunds are handled under the Returns Policy and applicable South African law.</p>

      <h2>9. Customer responsibilities</h2>
      <p>You must provide accurate account, contact, delivery and order information; keep your account credentials secure; use the platform lawfully; and avoid interfering with platform security, operations or other users.</p>

      <h2>10. Creator stores</h2>
      <p>Creator branding and product concepts may come from independent creators or organisations. FandomForge manages the platform transaction and fulfilment workflow, while creators remain responsible for the rights to their names, logos, artwork and other submitted content.</p>

      <h2>11. Liability and statutory rights</h2>
      <p>FandomForge does not exclude any right or remedy that cannot lawfully be excluded. To the extent permitted by law, FandomForge is not responsible for indirect loss, loss caused by inaccurate customer information, or delays outside its reasonable control.</p>

      <h2>12. Support</h2>
      <p>Customer support enquiries may be submitted through the Contact page or sent to ${SUPPORT_EMAIL}. Include the order number where relevant.</p>
    `
  ),

  privacy_policy: policy(
    "Privacy Policy",
    "How FandomForge collects, uses, shares and protects personal information.",
    `
      <h2>1. Responsible party</h2>
      <p>FandomForge (Pty) Ltd, registration number 2024/705706/07, is the responsible party for personal information processed through the FandomForge platform, subject to the Protection of Personal Information Act 4 of 2013 and other applicable South African law.</p>

      <h2>2. Information we collect</h2>
      <p>We may collect names, email addresses, phone numbers, delivery addresses, account details, creator and store information, order details, payment and payout references, uploaded files, support communications, and device or usage information needed to operate and protect the platform.</p>

      <h2>3. Why we process information</h2>
      <ul>
        <li>To create and administer customer, creator, production-partner and staff accounts.</li>
        <li>To process payments, creator payouts, orders, production, delivery, returns and refunds.</li>
        <li>To provide support and send transactional communications.</li>
        <li>To prevent fraud, protect users and enforce platform policies.</li>
        <li>To maintain legal, accounting, security and operational records.</li>
        <li>To improve platform reliability and user experience.</li>
      </ul>

      <h2>4. Payment and payout information</h2>
      <p>Payments and creator payouts may be processed through Paystack or another enabled payment provider. FandomForge receives transaction confirmations, references and account-status information required to operate the service, but does not intentionally store complete card details.</p>

      <h2>5. Sharing information</h2>
      <p>We may share the minimum information reasonably needed with creators, production partners, couriers, payment providers, hosting and security providers, professional advisers and authorities. Creator access to customer information is limited to what is needed to support the relevant order, delivery or collection arrangement.</p>

      <h2>6. Cookies and analytics</h2>
      <p>FandomForge may use essential cookies and similar technologies to keep users signed in, maintain carts, protect the platform, diagnose errors and understand aggregate usage. Optional analytics or marketing technologies will be handled according to the available consent and configuration controls.</p>

      <h2>7. Security</h2>
      <p>We use reasonable technical and organisational safeguards appropriate to the information and platform risks. No online service can guarantee absolute security, and users must also protect their passwords and devices.</p>

      <h2>8. Retention</h2>
      <p>Personal information is retained only for as long as reasonably required for the purpose for which it was collected, active transactions, dispute handling, fraud prevention, accounting, security or legal obligations.</p>

      <h2>9. Your rights</h2>
      <p>You may ask to access or correct your personal information, request deletion where appropriate, object to certain processing, or raise a privacy complaint. Some records may need to be retained where an active transaction or legal obligation requires it.</p>

      <h2>10. Children</h2>
      <p>Children may not create commercial creator accounts without appropriate adult authority. A parent, guardian or authorised organisation representative must manage accounts and transactions involving minors where required.</p>

      <h2>11. Privacy enquiries and complaints</h2>
      <p>Send privacy requests to ${SUPPORT_EMAIL} with enough information to identify the relevant account or transaction. You may also lodge a complaint with the Information Regulator of South Africa where applicable.</p>
    `
  ),

  shipping_policy: policy(
    "Shipping Policy",
    "Production, courier, group delivery and collection arrangements for FandomForge orders.",
    `
      <h2>1. Made-to-order production</h2>
      <p>Most products are produced after payment is confirmed. Standard production usually takes 2 to 3 business days unless the product page, creator store or order update states otherwise. Complex artwork, supplier delays or unusually large orders may take longer.</p>

      <h2>2. Courier delivery</h2>
      <p>Standard courier delivery usually takes 3 to 4 business days after production and dispatch. Remote areas, peak periods, courier disruptions and incomplete delivery information may extend delivery times.</p>

      <h2>3. Shipping charges</h2>
      <p>Available delivery or collection methods and their charges are shown at checkout before payment. The selected method becomes part of the order record.</p>

      <h2>4. Group delivery</h2>
      <p>Where a creator enables Group Delivery, qualifying orders are batched and delivered to the collection address according to the details shown at checkout. The creator or organisation manages the final handover to members or supporters.</p>

      <h2>5. Local or group collection</h2>
      <p>Collection may be available for selected stores or fulfilment arrangements. Customers must follow the location, date, identification and collection instructions shown during checkout or sent with the order update.</p>

      <h2>6. Delivery addresses</h2>
      <p>Customers are responsible for providing a complete and accurate delivery address. Contact ${SUPPORT_EMAIL} immediately if a correction is needed. Changes cannot be guaranteed after processing, and additional courier or handling charges may apply where a parcel must be redirected or resent.</p>

      <h2>7. Tracking and updates</h2>
      <p>Tracking information is supplied where supported by the delivery method. Courier tracking may not update immediately after dispatch.</p>

      <h2>8. Delayed, returned or uncollected parcels</h2>
      <p>FandomForge will assist with reasonable delivery enquiries. Courier delays outside FandomForge's direct control do not automatically cancel the order. Returned or uncollected parcels may require a new delivery payment before resending.</p>

      <h2>9. Delivery area</h2>
      <p>FandomForge currently fulfils orders within South Africa unless a product or checkout option states otherwise.</p>
    `
  ),

  returns_policy: policy(
    "Returns Policy",
    "How cancellations, damaged items, incorrect items, size issues, replacements and refunds are handled.",
    `
      <h2>1. Report an issue within 7 days</h2>
      <p>Return, replacement and refund requests should be submitted within 7 days after delivery or collection. Email ${SUPPORT_EMAIL} with the order number, a description of the issue and clear photographs where the item is damaged, faulty or incorrect. This reporting window does not remove any right that cannot lawfully be limited.</p>

      <h2>2. Cancellations before production</h2>
      <p>A customer may request cancellation before production begins. Once a made-to-order product has entered production, cancellation or changes may no longer be possible.</p>

      <h2>3. Damaged, faulty or incorrect items</h2>
      <p>Where FandomForge confirms that an item is damaged, faulty, incorrectly produced or different from the ordered product, FandomForge may arrange a replacement, correction, collection or refund as appropriate.</p>

      <h2>4. Incorrect size or variation selected</h2>
      <p>Customers must check available size and variation information before ordering. A return for a customer-selected size or variation may be considered where the item is unused, unworn and suitable for assessment, but personalised or made-to-order items may not qualify for exchange unless required by law or approved by FandomForge.</p>

      <h2>5. Item condition</h2>
      <p>Items that have been worn, washed, altered, damaged after delivery, or returned without required components may be declined unless the request relates to a verified product defect or another non-excludable consumer right.</p>

      <h2>6. Return authorisation</h2>
      <p>Do not send an item back before receiving return instructions. Unauthorised parcels may be delayed or may not reach the correct production partner.</p>

      <h2>7. Refund processing</h2>
      <p>Approved refunds are submitted through the available payment or banking process after assessment. Paystack, bank and other payment-provider processing times are outside FandomForge's direct control.</p>

      <h2>8. Statutory rights</h2>
      <p>This policy does not remove any consumer right or remedy that cannot lawfully be excluded under applicable South African law.</p>
    `
  ),

  creator_terms: policy(
    "Creator Terms",
    "The commercial, content, store, earnings and fulfilment terms for FandomForge creators.",
    `
      <h2>1. Creator authority</h2>
      <p>You must be at least 18 years old and have authority to create the account, represent the named creator or organisation, submit its branding, and accept these terms.</p>

      <h2>2. Store information</h2>
      <p>Creators must provide accurate ownership, contact, payout and store information and keep it current. FandomForge may request verification before approving products, enabling payouts or restoring a restricted store.</p>

      <h2>3. Content rights</h2>
      <p>You retain ownership of content you lawfully submit. You grant FandomForge and its assigned production partners the limited permission required to host, display, prepare, reproduce and manufacture that content for store operation, product approval, approved marketing, order fulfilment and support.</p>

      <h2>4. Your warranties</h2>
      <p>You confirm that you own or have commercial permission to use every name, logo, image, design, trademark and other asset submitted through your account. You must not upload content that infringes another person's rights or violates the Prohibited Content Policy.</p>

      <h2>5. Product approval</h2>
      <p>Products may be reviewed before publication. FandomForge may request changes or decline a product because of artwork quality, production limitations, pricing errors, legal risk, supplier restrictions or policy concerns.</p>

      <h2>6. Pricing and earnings</h2>
      <p>Current product costs, production costs, platform pricing components and estimated creator earnings are shown through the Creator Studio. Earnings arise only from valid paid orders and may be adjusted for refunds, chargebacks, cancellations, duplicated payments, fraud or calculation errors.</p>

      <h2>7. Friday Paystack payouts</h2>
      <p>Eligible creator payouts are processed every Friday through Paystack into the creator's linked and verified Paystack account. A creator must create or link that account and complete any required verification before receiving payouts. Paystack processing, account restrictions or incomplete details may delay the availability of funds.</p>

      <h2>8. Payout holds and adjustments</h2>
      <p>FandomForge may adjust or hold a payout while an order, refund, chargeback, account-ownership, fraud, intellectual-property or policy issue is investigated. The Payout Policy provides additional detail.</p>

      <h2>9. Fulfilment and customer support</h2>
      <p>FandomForge coordinates the platform order, production and delivery workflow. Creators must provide reasonable assistance with store-specific information, group-delivery arrangements and customer questions, and must not make promises that conflict with platform policies.</p>

      <h2>10. Store visibility</h2>
      <p>Public stores may be discoverable through FandomForge. Unlisted stores are intended to be accessed through a direct link. Private stores are limited according to the selected access controls. Creators are responsible for choosing the correct setting and sharing links with the intended audience.</p>

      <h2>11. Suspension and termination</h2>
      <p>FandomForge may restrict products, publishing, orders or payouts under the Store Suspension Policy. Account closure may be requested after outstanding orders, disputes, balances and legal obligations have been resolved.</p>

      <h2>12. Creator conduct</h2>
      <p>Creators must not misrepresent FandomForge, interfere with the platform, collect customer payments outside the approved checkout for platform orders, misuse customer information, or use the platform for unlawful activity.</p>

      <h2>13. Support</h2>
      <p>Creator support and payout queries may be sent to ${SUPPORT_EMAIL}. Include the store name and relevant order or payout reference.</p>
    `
  ),

  printer_terms: policy(
    "Production Partner Terms",
    "The operational terms that apply to approved FandomForge production partners.",
    `
      <h2>1. Approval</h2>
      <p>Production access is limited to partners approved by FandomForge. Approval may depend on capability, location, pricing, capacity, quality controls and service standards.</p>

      <h2>2. Job information</h2>
      <p>Partners may use job, artwork and customer information only to complete assigned production and fulfilment work.</p>

      <h2>3. Quality and timing</h2>
      <p>Partners must follow the approved product specification, manufacturing instructions, quality standards and status workflow for each job.</p>

      <h2>4. Confidentiality</h2>
      <p>Artwork, customer information, creator information and commercial platform data must be kept confidential and securely handled.</p>

      <h2>5. Payment</h2>
      <p>Production partner payment is based on approved platform records and may be held while a job, quality, refund or fraud issue is investigated.</p>

      <h2>6. Suspension</h2>
      <p>FandomForge may pause assignments or terminate production access where quality, capacity, security, confidentiality or service requirements are not met.</p>
    `
  ),

  intellectual_property: policy(
    "Intellectual Property Policy",
    "Ownership and permitted use of creator content, product assets and FandomForge platform material.",
    `
      <h2>1. Creator content</h2>
      <p>Creators retain ownership of original content they lawfully submit. Uploading content does not transfer ownership to FandomForge.</p>

      <h2>2. Licence required to operate the platform</h2>
      <p>A creator grants FandomForge and assigned production partners a limited, non-exclusive licence to store, display, resize, convert, prepare, reproduce and manufacture submitted content only as reasonably required to operate the store, review products, fulfil orders and provide support.</p>

      <h2>3. Third-party rights</h2>
      <p>Creators and customers may only submit content they created or are authorised to use commercially. Buying an image, finding it online, crediting an owner, or changing an existing design does not automatically create commercial permission.</p>

      <h2>4. FandomForge material</h2>
      <p>The FandomForge name, platform interface, original platform copy, software, templates and brand assets remain the property of FandomForge or their respective licensors. They may not be copied or used to create a competing service without written permission.</p>

      <h2>5. Removal and evidence</h2>
      <p>FandomForge may hide or remove content while ownership or permission is investigated. A creator may be asked to provide licences, source files, written permission or other evidence of rights.</p>

      <h2>6. Repeat infringement</h2>
      <p>Repeated or deliberate infringement may lead to product removal, payout holds or store suspension.</p>

      <h2>7. Reporting a concern</h2>
      <p>Send intellectual-property concerns to ${SUPPORT_EMAIL} with the reported store or product link and evidence of the relevant rights.</p>
    `
  ),

  prohibited_content: policy(
    "Prohibited Content Policy",
    "Content and product categories that may not be uploaded, published or sold through FandomForge.",
    `
      <h2>1. Illegal and infringing content</h2>
      <p>Content that is unlawful, stolen, fraudulent, counterfeit, defamatory, privacy-invasive or infringes copyright, trademark, design, personality or other rights is prohibited.</p>

      <h2>2. Harmful and abusive content</h2>
      <p>Content that promotes credible threats, targeted harassment, exploitation, sexual abuse, non-consensual sexual material, human trafficking, terrorism or violent extremist activity is prohibited.</p>

      <h2>3. Hate and discrimination</h2>
      <p>Content that attacks, dehumanises or promotes hatred or violence against people based on protected characteristics is prohibited.</p>

      <h2>4. Children and vulnerable persons</h2>
      <p>Sexualised content involving minors, content that exploits children, or publication of sensitive identifying information about children without proper authority is prohibited.</p>

      <h2>5. Dangerous and regulated activity</h2>
      <p>Products or content facilitating illegal weapons, controlled substances, dangerous instructions, counterfeit documents or other unlawful or regulated activity may not be sold through the platform.</p>

      <h2>6. Misleading commercial content</h2>
      <p>Creators may not impersonate another organisation, falsely claim endorsement, misrepresent fundraising beneficiaries, or make deceptive claims about products or proceeds.</p>

      <h2>7. Enforcement</h2>
      <p>FandomForge may reject, remove or restrict content and may suspend related orders or payouts while a concern is reviewed.</p>

      <h2>8. Reporting prohibited content</h2>
      <p>Reports may be sent to ${SUPPORT_EMAIL}. Include the store or product link and a clear explanation of the concern.</p>
    `
  ),

  copyright_complaints: policy(
    "Copyright Complaints Procedure",
    "How rights holders can report allegedly infringing products or store content.",
    `
      <h2>1. Submitting a complaint</h2>
      <p>Send copyright or intellectual-property complaints to ${SUPPORT_EMAIL} with the subject line "Intellectual Property Complaint".</p>

      <h2>2. Information required</h2>
      <ul>
        <li>Your full name, organisation and contact details.</li>
        <li>Identification of the protected work, trademark or other right.</li>
        <li>The FandomForge store, product or URL being reported.</li>
        <li>An explanation of why the use is unauthorised.</li>
        <li>Evidence that you own the right or are authorised to act for the owner.</li>
        <li>A statement that the information supplied is accurate and submitted in good faith.</li>
      </ul>

      <h2>3. Review process</h2>
      <p>FandomForge may temporarily hide reported content while reviewing the complaint and may ask the creator for evidence of permission. FandomForge does not decide complex ownership disputes but may keep content offline until adequate evidence is supplied or the parties resolve the issue.</p>

      <h2>4. Creator response</h2>
      <p>A creator who believes content was removed incorrectly may respond with source files, licences, written permission or other relevant evidence.</p>

      <h2>5. False complaints</h2>
      <p>Knowingly false or misleading complaints may cause harm to creators and may be referred for legal advice or appropriate action.</p>
    `
  ),

  payout_policy: policy(
    "Payout Policy",
    "Friday creator payouts through Paystack, eligibility, holds and adjustments.",
    `
      <h2>1. Payout schedule</h2>
      <p>Eligible creator payouts are processed every Friday through Paystack into the creator's linked and verified Paystack account.</p>

      <h2>2. Paystack account requirement</h2>
      <p>Creators must create or link a Paystack account and complete any verification required by FandomForge or Paystack before receiving payouts. Incorrect, incomplete, restricted or unverified account details may delay payment.</p>

      <h2>3. Eligible earnings</h2>
      <p>Creator earnings arise from valid paid orders according to the amount recorded by the platform. Pending, failed, cancelled, refunded or fraudulent orders do not create payable earnings.</p>

      <h2>4. Friday cutoff and processing</h2>
      <p>Only earnings marked eligible before the applicable Friday payout run are included. Earnings that become eligible after processing has begun move to the next Friday run. Paystack processing times and account availability are outside FandomForge's direct control.</p>

      <h2>5. Adjustments</h2>
      <p>FandomForge may adjust earnings for refunds, chargebacks, duplicated transactions, cancellations, fraud, pricing errors, production corrections or amounts previously paid in error. Adjustments will be reflected in the available platform records where supported.</p>

      <h2>6. Holds</h2>
      <p>A payout may be held while FandomForge investigates account ownership, fraud, prohibited content, intellectual-property complaints, customer disputes, unusual transaction activity or a material breach of the Creator Terms.</p>

      <h2>7. Tax and records</h2>
      <p>Creators remain responsible for their own tax, accounting and reporting obligations. FandomForge may request information reasonably required for payment records or legal compliance.</p>

      <h2>8. Payout support</h2>
      <p>Send payout questions to ${SUPPORT_EMAIL} and include the creator store name, relevant order or payout reference, and a clear description of the issue.</p>
    `
  ),

  store_suspension: policy(
    "Store Suspension Policy",
    "When FandomForge may restrict a store, product, account, order flow or payout.",
    `
      <h2>1. Reasons for restriction</h2>
      <p>FandomForge may restrict a product or store because of prohibited content, suspected infringement, fraud, security risk, inaccurate account information, unresolved customer harm, repeated production issues, payment abuse, misuse of personal information or a serious breach of platform terms.</p>

      <h2>2. Types of restriction</h2>
      <p>Depending on the risk, FandomForge may hide individual products, pause publishing, stop new orders, restrict account access, hold payouts, disable public discovery or suspend the entire store.</p>

      <h2>3. Existing orders</h2>
      <p>Where reasonably possible, FandomForge will continue or resolve valid existing customer orders. A suspension does not remove the creator's responsibilities for prior orders, disputes, refunds or policy breaches.</p>

      <h2>4. Notice and response</h2>
      <p>FandomForge may notify the creator of the reason and required corrective action unless notice would create a security, fraud or legal risk. The creator may submit relevant evidence or a remediation plan to ${SUPPORT_EMAIL}.</p>

      <h2>5. Restoration</h2>
      <p>Access may be restored after the underlying concern is resolved, required verification is completed and FandomForge is satisfied that continued operation will not create unacceptable customer, legal or platform risk.</p>

      <h2>6. Permanent closure</h2>
      <p>FandomForge may permanently close a store for serious, repeated or deliberate violations, subject to outstanding order, record-retention and legal obligations.</p>
    `
  ),
};

export const POLICY_ALIASES = {
  customer_terms: "terms_and_conditions",
  shop_terms: "terms_and_conditions",
  terms: "terms_and_conditions",
  privacy: "privacy_policy",
  shipping: "shipping_policy",
  delivery_terms: "shipping_policy",
  returns: "returns_policy",
  refunds: "returns_policy",
  intellectual_property_policy: "intellectual_property",
  copyright_policy: "copyright_complaints",
  suspension_policy: "store_suspension",
};

export const POLICY_LINKS = [
  { key: "terms_and_conditions", title: "Customer Terms", description: LOCAL_POLICIES.terms_and_conditions.summary, to: "/terms" },
  { key: "creator_terms", title: "Creator Terms", description: LOCAL_POLICIES.creator_terms.summary, to: "/creator-terms" },
  { key: "privacy_policy", title: "Privacy Policy", description: LOCAL_POLICIES.privacy_policy.summary, to: "/privacy-policy" },
  { key: "shipping_policy", title: "Shipping Policy", description: LOCAL_POLICIES.shipping_policy.summary, to: "/shipping-policy" },
  { key: "returns_policy", title: "Returns Policy", description: LOCAL_POLICIES.returns_policy.summary, to: "/returns" },
  { key: "intellectual_property", title: "Intellectual Property", description: LOCAL_POLICIES.intellectual_property.summary, to: "/intellectual-property" },
  { key: "prohibited_content", title: "Prohibited Content", description: LOCAL_POLICIES.prohibited_content.summary, to: "/prohibited-content" },
  { key: "copyright_complaints", title: "Copyright Complaints", description: LOCAL_POLICIES.copyright_complaints.summary, to: "/copyright-complaints" },
  { key: "payout_policy", title: "Payout Policy", description: LOCAL_POLICIES.payout_policy.summary, to: "/payout-policy" },
  { key: "store_suspension", title: "Store Suspension", description: LOCAL_POLICIES.store_suspension.summary, to: "/store-suspension-policy" },
];

export function normalizePolicyKey(value) {
  const key = String(value || "terms_and_conditions").trim().toLowerCase().replace(/-/g, "_");
  return POLICY_ALIASES[key] || key;
}

export function getLocalPolicy(value) {
  return LOCAL_POLICIES[normalizePolicyKey(value)] || null;
}
