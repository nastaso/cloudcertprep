import fs from 'fs';
import path from 'path';

const domains = ['domain1.json', 'domain2.json', 'domain3.json', 'domain4.json', 'domain5.json'];
const dataDir = path.join(process.cwd(), 'src', 'data', 'aif-c01');

let total = 0;
let outOfScopeServices = [
    'AWS Clean Rooms', 'Amazon CloudSearch', 'Amazon Managed Streaming for Apache Kafka (Amazon MSK)',
    'Amazon AppFlow', 'Amazon MQ', 'Amazon Simple Workflow Service (Amazon SWF)',
    'Amazon Chime', 'Amazon Pinpoint', 'Amazon Simple Email Service (Amazon SES)', 'AWS Supply Chain', 'AWS Wickr', 'Amazon WorkMail',
    'AWS Application Cost Profiler', 'AWS Billing Conductor', 'AWS Marketplace',
    'AWS App Runner', 'AWS Elastic Beanstalk', 'EC2 Image Builder', 'Amazon Lightsail',
    'Red Hat OpenShift Service on AWS (ROSA)',
    'AWS IQ', 'AWS Managed Services (AMS)', 'AWS re:Post Private', 'AWS Support',
    'Amazon Keyspaces', 'Amazon Quantum Ledger Database', 'Amazon Timestream',
    'AWS AppConfig', 'AWS Application Composer', 'AWS CloudShell', 'Amazon CodeCatalyst', 'AWS CodeStar', 'AWS Fault Injection Service', 'AWS X-Ray',
    'Amazon AppStream 2.0', 'Amazon WorkSpaces', 'Amazon WorkSpaces Thin Client', 'Amazon WorkSpaces Web',
    'AWS Amplify', 'AWS AppSync', 'AWS Device Farm', 'Amazon Location Service',
    'AWS IoT Analytics', 'AWS IoT Core', 'AWS IoT Device Defender', 'AWS IoT Device Management', 'AWS IoT Events', 'AWS IoT FleetWise', 'FreeRTOS', 'AWS IoT Greengrass', 'AWS IoT 1-Click', 'AWS IoT RoboRunner', 'AWS IoT SiteWise', 'AWS IoT TwinMaker',
    'AWS DeepComposer', 'AWS HealthImaging', 'AWS HealthOmics', 'Amazon Monitron', 'AWS Panorama',
    'AWS Control Tower', 'AWS Health Dashboard', 'AWS Launch Wizard', 'AWS License Manager', 'Amazon Managed Grafana', 'Amazon Managed Service for Prometheus', 'AWS OpsWorks', 'AWS Organizations', 'AWS Proton', 'AWS Resilience Hub', 'AWS Resource Explorer', 'AWS Resource Groups', 'AWS Systems Manager Incident Manager', 'AWS Service Catalog', 'Service Quotas', 'AWS Telco Network Builder', 'AWS User Notifications',
    'Amazon Elastic Transcoder', 'AWS Elemental MediaConnect', 'AWS Elemental MediaConvert', 'AWS Elemental MediaLive', 'AWS Elemental MediaPackage', 'AWS Elemental MediaStore', 'AWS Elemental MediaTailor', 'Amazon Interactive Video Service (Amazon IVS)', 'Amazon Nimble Studio',
    'AWS Application Discovery Service', 'AWS Application Migration Service', 'AWS Database Migration Service', 'AWS DataSync', 'AWS Mainframe Modernization', 'AWS Migration Hub', 'AWS Snow Family', 'AWS Transfer Family',
    'AWS App Mesh', 'AWS Cloud Map', 'AWS Direct Connect', 'AWS Global Accelerator', 'AWS Private 5G', 'Amazon Route 53', 'Amazon Route 53 Application Recovery Controller', 'Amazon VPC IP Address Manager (IPAM)',
    'AWS Certificate Manager (ACM)', 'AWS CloudHSM', 'Amazon Cognito', 'Amazon Detective', 'AWS Directory Service', 'AWS Firewall Manager', 'Amazon GuardDuty', 'AWS IAM Identity Center', 'AWS Payment Cryptography', 'AWS Private Certificate Authority', 'AWS Resource Access Manager', 'AWS Security Hub', 'Amazon Security Lake', 'AWS Shield', 'AWS Signer', 'Amazon Verified Permissions', 'AWS WAF',
    'AWS Backup', 'AWS Elastic Disaster Recovery',
    'Amazon SageMaker' // usually should be Amazon SageMaker AI
];

for (const d of domains) {
    const filePath = path.join(dataDir, d);
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`${d}: ${content.length} questions`);
    total += content.length;
}
console.log(`Total questions: ${total}`);
