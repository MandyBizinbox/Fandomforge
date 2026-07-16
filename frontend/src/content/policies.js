const UPDATED_DATE = "16 July 2026";

function policy(title, summary, content) {
  return {
    platform_name: "FandomForge",
    title,
    summary,
    content: `<p><strong>Last updated:</strong> ${UPDATED_DATE}</p>${content}`,
  };
}

export const LOCAL_POLICIES = {
  terms_and_conditions: policy(
    "Customer Terms",
    "The terms that apply when customers browse, order and pay through FandomForge.",
    `
      <h2>1. About FandomForge</h2>
      <p>FandomForge is operated by FandomForge (Pty) Ltd, registration number 2024/705706/07, in South Africa. The platform enables creators and community organisations to offer approved made-to-order merchandise through branded online stores.</p>

      <h2>2. Accepting these terms</h2>
      <p>By creating an account, placing an order or using the platform, you agree to these Customer Terms, the Privacy Policy, Shipping Policy and Returns Policy. If you do not agree, you should not use the platform or place an order.</p>

      <h2>3. Product information</h2>
      <p>Product descriptions, size information, mockups and colours are provided as practical guides. Small variations may occur because of screen settings, garment batches, manufacturing methods and supplier availability. Customers must check product information and selected variations before completing payment.</p>

      <h2>4. Made-to-order products</h2>
      <p>Most FandomForge products are made after payment is confirmed. Production may begin soon after payment, which can limit the ability to cancel or change an order.</p>

      <h2>5. Prices and payment</h2>
      <p>Prices are shown in South African rand unless stated otherwise. Available payment methods are displayed during checkout and may be provided by third-party payment processors. An order is only accepted once payment is confirmed and the platform issues an order confirmation.</p>

      <h2>6. Order acceptance and review</h2>
      <p>FandomForge may reject, pause or cancel an order where payment cannot be verified, the order appears fraudulent, the product is unavailable, the artwork or content is prohibited, or fulfilment is not reasonably possible. Where FandomForge cancels a paid order, the appropriate refund process will be followed.</p>

      <h2>7. Delivery</h2>
      <p>Production and delivery estimates are not guarantees. Courier, group-delivery and collection options are governed by the Shipping Policy and the information shown during checkout.</p>

      <h2>8. Cancellations, returns and refunds</h2>
      <p>Cancellation requests must be submitted before production starts. Returns, replacements and refunds are handled under the Returns Policy and applicable South African law.</p>

      <h2>9. Customer responsibilities</h2>
      <p>You must provide accurate contact, delivery and order information; keep account credentials secure; use the platform lawfully; and avoid interfering with platform security or other users.</p>

      <h2>10. Creator stores</h2>
      <p>Creator branding and product concepts may come from independent creators or organisations. FandomForge manages the platform transaction and fulfilment workflow, while creators remain responsible for the rights to their names, logos, artwork and other submitted content.</p>

      <h2>11. Liability</h2>
      <p>FandomForge does not exclude any right or remedy that cannot lawfully be excluded. To the extent permitted by law, FandomForge is not responsible for indirect loss, loss caused by inaccurate customer information, or delays outside its reasonable control.</p>

      <h2>12. Contact</h2>
      <p>Customer support enquiries may be submitted through the Contact page or sent to info@theforgeza.co.za.</p>
    `
  ),

  privacy_policy: policy(
    "Privacy Policy",
    "How FandomForge collects, uses, shares and protects personal information.",
    `
      <h2>1. Responsible party</h2>
      <p>FandomForge (Pty) Ltd, registration number 2024/705706/07, is responsible for personal information processed through the FandomForge platform, subject to the Protection of Personal Information Act and other applicable South African law.</p>

      <h2>2. Information we collect</h2>
      <p>We may collect names, email addresses, phone numbers, delivery addresses, account details, creator profile information, store information, order details, payment references, uploaded files, device and usage information, and support communications.</p>

      <h2>3. Why we process information</h2>
      <ul>
        <li>To create and administer customer, creator, printer and staff accounts.</li>
        <li>To process payments, orders, production, delivery, returns and payouts.</li>
        <li>To provide support and send transactional communications.</li>
        <li>To prevent fraud, protect the platform and enforce platform policies.</li>
        <li>To maintain records required for legal, accounting and operational purposes.</li>
        <li>To improve platform reliability and user experience.</li>
      </ul>

      <h2>4. Payment information</h2>
      <p>Payments may be processed by enabled third-party payment providers. FandomForge receives payment confirmations and references but does not intentionally store complete card details on the platform.</p>

      <h2>5. Sharing information</h2>
      <p>We may share the minimum information needed with creators, production partners, couriers, payment providers, hosting and security providers, professional advisers and authorities where required by law. Creator access to customer information is limited to what is reasonably needed to support the relevant order or collection arrangement.</p>

      <h2>6. Cookies, analytics and security</h2>
      <p>FandomForge may use essential cookies, analytics and infrastructure services to keep users signed in, maintain carts, protect the platform, diagnose errors and understand aggregate usage. Security measures are applied according to the nature of the information and the available platform safeguards.</p>

      <h2>7. Retention</h2>
      <p>Information is retained only for as long as reasonably required for the purpose for which it was collected, platform administration, dispute handling, fraud prevention, accounting or legal obligations.</p>

      <h2>8. Your choices and requests</h2>
      <p>You may ask to access, correct or delete personal information, object to certain processing, or raise a privacy complaint. Some information may need to be retained where the law or an active transaction requires it.</p>

      <h2>9. Children</h2>
      <p>The platform is not intended for children to create commercial accounts without appropriate adult authority. A parent, guardian or authorised organisation representative must manage accounts and orders involving minors where required.</p>

      <h2>10. Contact about privacy</h2>
      <p>Privacy requests can be sent to info@theforgeza.co.za. Please include enough information for FandomForge to identify the relevant account or transaction.</p>
    `
  ),

  shipping_policy: policy(
    "Shipping Policy",
    "Production, courier, group delivery and collection arrangements for FandomForge orders.",
    `
      <h2>1. Made-to-order production</h2>
      <p>Most products are produced after payment is confirmed. Standard production is generally expected to take approximately 2 to 3 business days unless the product page, creator store or order update states otherwise.</p>

      <h2>2. Courier delivery</h2>
      <p>Standard courier delivery after production is generally expected to take approximately 4 to 5 business days. Remote areas, peak periods, courier disruptions and incomplete address information may extend delivery times.</p>

      <h2>3. Group delivery</h2>
      <p>Where a creator enables Group Delivery, qualifying orders are batched and delivered to the collection address and according to the batch details shown at checkout. The creator or organisation manages the final collection handover to its members or supporters.</p>

      <h2>4. Local collection</h2>
      <p>Local collection may be available for selected stores or fulfilment arrangements. Customers must follow the collection instructions shown during checkout or sent with the order update.</p>

      <h2>5. Delivery addresses</h2>
      <p>Customers are responsible for providing a complete and accurate delivery address. Additional courier or handling charges may apply where a parcel must be redirected or resent because of incorrect details.</p>

      <h2>6. Tracking and delivery updates</h2>
      <p>Tracking information is supplied where supported by the delivery method. A tracking event is generated by the courier and may not update immediately after dispatch.</p>

      <h2>7. Delayed, returned or uncollected parcels</h2>
      <p>FandomForge will assist with reasonable delivery enquiries. Courier delays and events outside FandomForge's direct control do not automatically cancel the order. Returned or uncollected parcels may require a new delivery payment before resending.</p>

      <h2>8. Delivery area</h2>
      <p>FandomForge currently fulfils orders within South Africa unless a specific product or checkout option states otherwise.</p>
    `
  ),

  returns_policy: policy(
    "Returns Policy",
    "How cancellations, damaged items, incorrect items, size issues, replacements and refunds are handled.",
    `
      <h2>1. Contact us promptly</h2>
      <p>Return, replacement and refund requests should be submitted within 7 days after delivery or collection. Include the order number, a description of the issue and clear photographs where the item is damaged, faulty or incorrect.</p>

      <h2>2. Cancellations before production</h2>
      <p>A customer may request cancellation before production begins. Once a made-to-order product has entered production, cancellation or changes may no longer be possible.</p>

      <h2>3. Damaged, faulty or incorrect items</h2>
      <p>Where FandomForge confirms that an item is damaged, faulty, incorrectly produced or different from the ordered product, FandomForge may arrange a replacement, correction, collection or refund as appropriate.</p>

      <h2>4. Incorrect size selected by the customer</h2>
      <p>Customers must check the available size information before ordering. A return for a customer-selected size may be considered where the item is unused, unworn and suitable for assessment, but made-to-order or personalised items may not qualify for exchange unless required by law or approved by FandomForge.</p>

      <h2>5. Non-returnable condition</h2>
      <p>Items that have been worn, washed, altered, damaged after delivery, or returned without required components may be declined unless the return relates to a verified product defect.</p>

      <h2>6. Return authorisation</h2>
      <p>Do not send an item back before receiving return instructions. Unauthorised parcels may be delayed or may not reach the correct production partner.</p>

      <h2>7. Refund timing</h2>
      <p>Approved refunds are submitted through the available payment or banking process after assessment. Bank and payment-provider processing times are outside FandomForge's direct control.</p>

      <h2>8. Statutory rights</h2>
      <p>This policy does not remove any consumer right that cannot lawfully be excluded under applicable South African law.</p>
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
      <p>You retain ownership of content you submit. You grant FandomForge and its production partners the limited permission required to host, display, prepare, reproduce and manufacture that content for store operation, product approval, marketing approved by you, order fulfilment and support.</p>

      <h2>4. Your warranties</h2>
      <p>You confirm that you own or have permission to use every name, logo, image, design, trademark and other asset submitted through your account. You must not upload content that infringes another person's rights or violates the Prohibited Content Policy.</p>

      <h2>5. Product approval</h2>
      <p>Products may be reviewed before publication. FandomForge may request changes or decline a product because of artwork quality, production limitations, pricing errors, legal risk, supplier restrictions or policy concerns.</p>

      <h2>6. Pricing and earnings</h2>
      <p>Available product costs, platform charges and creator earnings are shown through the platform's pricing workflow. Earnings are only recognised on valid paid orders and may be adjusted for refunds, chargebacks, cancellations, duplicated payments, fraud or calculation errors.</p>

      <h2>7. Payouts</h2>
      <p>Creator payouts are governed by the Payout Policy. A creator must provide accurate payout details and any requested verification or tax information. FandomForge may hold a payout while an order, account, fraud or ownership issue is investigated.</p>

      <h2>8. Fulfilment and customer support</h2>
      <p>FandomForge coordinates the platform order and production workflow. Creators must provide reasonable assistance with store-specific information, group delivery arrangements and customer questions but may not make promises that conflict with platform policies.</p>

      <h2>9. Store visibility</h2>
      <p>Public, unlisted and private visibility settings determine how a store is discovered. A direct link may remain accessible according to the selected setting. Creators are responsible for sharing store links only with the intended audience.</p>

      <h2>10. Suspension and termination</h2>
      <p>FandomForge may restrict products, publishing, orders or payouts under the Store Suspension Policy. You may request account closure after outstanding orders, disputes, balances and legal obligations have been resolved.</p>

      <h2>11. Creator conduct</h2>
      <p>Creators must not misrepresent FandomForge, interfere with the platform, collect customer payments outside the approved checkout for platform orders, misuse customer information, or use the platform for unlawful activity.</p>
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
      <p>Creators and customers may only submit content they created or are authorised to use. Buying an image, finding an image online, crediting an owner, or changing an existing design does not automatically create permission to use it commercially.</p>

      <h2>4. FandomForge material</h2>
      <p>The FandomForge name, platform interface, original platform copy, software, templates and brand assets remain the property of FandomForge or their respective licensors. They may not be copied or used to create a competing service without written permission.</p>

      <h2>5. Removal and evidence</h2>
      <p>FandomForge may hide or remove content while ownership or permission is investigated. A creator may be asked to provide licences, source files, written permission or other evidence of rights.</p>

      <h2>6. Repeat infringement</h2>
      <p>Repeated or deliberate infringement may lead to product removal, payout holds or store suspension.</p>
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

      <h2>5. Dangerous and regulated goods</h2>
      <p>Products or content facilitating illegal weapons, controlled substances, dangerous instructions, counterfeit documents or other regulated activity may not be sold through the platform.</p>

      <h2>6. Misleading commercial content</h2>
      <p>Creators may not impersonate another organisation, falsely claim endorsement, misrepresent fundraising beneficiaries, or make deceptive claims about products or proceeds.</p>

      <h2>7. Enforcement</h2>
      <p>FandomForge may reject, remove or restrict content and may suspend related orders or payouts while a concern is reviewed.</p>
    `
  ),

  copyright_complaints: policy(
    "Copyright Complaints Procedure",
    "How rights holders can report allegedly infringing products or store content.",
    `
      <h2>1. Submitting a complaint</h2>
      <p>Send copyright or intellectual-property complaints to info@theforgeza.co.za with the subject line "Intellectual Property Complaint".</p>

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
      <p>FandomForge may temporarily hide the reported content while reviewing the complaint and may ask the creator for evidence of permission. FandomForge does not decide complex ownership disputes but may keep content offline until the parties resolve the issue or adequate evidence is supplied.</p>

      <h2>4. Creator response</h2>
      <p>A creator who believes content was removed incorrectly may respond with source files, licences, written permission or other relevant evidence.</p>

      <h2>5. False complaints</h2>
      <p>Knowingly false or misleading complaints may cause harm to creators and may be referred for legal advice or appropriate action.</p>
    `
  ),

  payout_policy: policy(
    "Payout Policy",
    "When creator earnings become payable, what can delay payment and how adjustments are handled.",
    `
      <h2>1. Eligible earnings</h2>
      <p>Creator earnings arise from valid paid orders according to the pricing and earning amount recorded by the platform. Pending, failed, cancelled, refunded or fraudulent orders do not create payable earnings.</p>

      <h2>2. Payout readiness</h2>
      <p>Earnings may remain pending until payment is confirmed, the applicable order and return-risk period has progressed, and required creator verification and payout details are complete.</p>

      <h2>3. Payout details</h2>
      <p>Creators are responsible for providing accurate account-holder and banking information. FandomForge is not responsible for delays or losses caused by incorrect payout information supplied by the creator.</p>

      <h2>4. Adjustments</h2>
      <p>FandomForge may adjust earnings for refunds, chargebacks, duplicated transactions, cancellations, fraud, pricing errors, production corrections or amounts previously paid in error. Adjustments will be reflected in the available platform records where supported.</p>

      <h2>5. Holds</h2>
      <p>A payout may be held while FandomForge investigates account ownership, fraud, prohibited content, intellectual-property complaints, customer disputes, unusual transaction activity or a material breach of the Creator Terms.</p>

      <h2>6. Tax and records</h2>
      <p>Creators remain responsible for their own tax, accounting and reporting obligations. FandomForge may request information reasonably required for payment records or legal compliance.</p>

      <h2>7. Queries</h2>
      <p>Payout questions should include the creator store name, relevant order or payout reference and a clear description of the issue.</p>
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
      <p>FandomForge may notify the creator of the reason and required corrective action unless notice would create a security, fraud or legal risk. The creator may submit relevant evidence or a remediation plan through support.</p>

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
