import React from "react";
const PrivacyPolicyScreen = () => {
  return (
    <div className="privacy-container">
      <h1>Privacy Policy for MyMor</h1>
      {/* <p className="date">Effective Date: May 22, 2025</p> */}

      <h2>1. Information We Collect</h2>
      <p>
        We may collect the following types of information when you use the App:
        <ul>
          <li>Personal Information: Name, email, phone, academic details</li>
          <li>Usage Data: App usage, device info, interaction data</li>
          <li>Media and Files: Uploaded images, docs, chat messages</li>
          <li>Location: If permission is granted, for location-based features</li>
        </ul>
      </p>

      <h2>2. How We Use Your Information</h2>
      <p>
        • To provide and improve features<br/>
        • Personalize your experience<br/>
        • Communicate with you and send updates<br/>
        • Maintain security and fulfill legal requirements
      </p>

      <h2>3. Sharing of Information</h2>
      <p>
        We do not sell your personal data. Information may be shared with:
        <ul>
          <li>Trusted service providers (e.g., Firebase)</li>
          <li>Legal authorities when required</li>
          <li>Other users when using public features</li>
        </ul>
      </p>

      <h2>4. Data Retention</h2>
      <p>
        We retain data as long as necessary for services or legal obligations.
      </p>

      <h2>5. Security</h2>
      <p>
        We use encryption and secure servers. However, no system is completely secure.
      </p>

      <h2>6. Your Rights</h2>
      <p>
        You can access, update, or delete your data by contacting us.
      </p>

      <h2>7. Children’s Privacy</h2>
      <p>
        MyMor is for users 13+. We do not knowingly collect data from children under 13.
      </p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this policy. Significant changes will be communicated via the app or email.
      </p>

      <h2>9. Contact Us</h2>
      <p>
      Email: chiggy14@gmail.com <br/>
          Address: 1/29 Westbrook St Chadstone VIC 3148
          Australia
      </p>
    </div>
   
  );
};

export default PrivacyPolicyScreen;

