Carefully audit the entire project before making changes. Examine every customer-facing app, admin interface, backend service, database schema, authentication flow, API, environment configuration, and deployment setup.

The repository appears to contain:
- An Expo/React Native mobile app
- An AS Store web application
- An AS Company website
- Admin/CMS interfaces
- Express/PostgreSQL backend APIs

Verify the actual architecture and dependencies instead of relying only on this summary.

Objective

Design and implement a comprehensive, production-ready notification system that supports transactional, promotional, informational, and interactive notifications across the project.

The mechanism should be dynamic, extensible, secure, reliable, and manageable from the admin interfaces. It must support current requirements while making future notification types easy to add.

Required notification use cases

Implement support for notifications such as:

1. Orders
- Order received
- Order confirmed
- Order processing
- Order shipped or out for delivery
- Order delivered
- Order cancelled
- Order notes or status changes
- Payment or cash-on-delivery updates

2. Promotions and offers
- New offers
- Product promotions
- Category- or brand-specific campaigns
- Voucher and coupon announcements
- New product arrivals
- Back-in-stock notifications
- Limited-time campaigns

3. Surveys and interactive messages
- Customer satisfaction surveys
- Post-delivery feedback requests
- Polls
- Promotional popups
- Configurable calls to action
- Optional response collection and reporting

4. News and content
- Company announcements
- Store news
- Event announcements and reminders
- Service updates
- Maintenance notices
- Important policy or account notices

5. Accounts and security
- Sign-in or one-time-code notices where appropriate
- Account changes
- New device or suspicious activity warnings
- Privacy and security announcements

Supported delivery surfaces

Implement an appropriate channel strategy for the existing applications:

- Native push notifications for Android and iOS
- In-app notification inbox/notification center
- In-app banners, dialogs, cards, and promotional popups
- Web notifications or Web Push where the architecture and browser support make this appropriate
- Email and WhatsApp integration points where existing infrastructure already supports them

Do not send the same message through every channel by default. Channel selection must be configurable per notification type and campaign.

Architecture requirements

Create a centralized notification domain rather than scattering notification logic throughout the codebase.

The design should include:

- Notification event producers
- A centralized notification service
- Reusable templates
- User and audience targeting
- Delivery-channel adapters
- Scheduling
- Delivery attempts
- Retry handling
- Idempotency and duplicate prevention
- Delivery status tracking
- Read/unread state
- Deep-link routing
- Audit history
- Failure logging
- Extensible provider interfaces

Use a queue or durable background-processing mechanism if appropriate for the current deployment architecture. Do not make important application requests wait for external notification providers.

Notification records should support fields such as:

- Notification ID
- Type
- Category
- Title
- Body
- Rich content or image
- Target URL or application deep link
- Action buttons
- Channel
- Priority
- Recipient or audience
- Template ID and version
- Structured metadata
- Scheduled time
- Sent time
- Expiration time
- Delivery status
- Read status
- Failure reason
- Created-by administrator
- Created and updated timestamps

Admin functionality

Add a clear notification-management area to the appropriate admin interface.

Administrators should be able to:

- Create, edit, duplicate, preview, schedule, send, pause, and cancel campaigns
- Send immediately or schedule for later
- Choose one or more supported channels
- Select notification type and template
- Target all users or filtered audiences
- Target users by account status, order history, category interest, location/area when legitimately available, or other existing data
- Avoid sending to users who have opted out
- Configure a deep link or call-to-action
- Configure popup behavior and expiration
- Preview mobile and web presentation
- Send a test notification
- Review delivery, failure, open, click, read, and response statistics
- Review the notification audit log
- Manage reusable templates
- Manage survey questions and responses where applicable

Customer-facing functionality

Implement a polished notification experience in the mobile app and relevant web apps:

- Notification inbox with unread count
- Read/unread and mark-all-read behavior
- Notification detail or action handling
- Correct deep links to products, categories, orders, events, surveys, account pages, and offers
- Foreground, background, and terminated-app handling for native notifications
- Permission onboarding that explains the benefit before requesting operating-system permission
- Notification preference center
- Per-category opt-in and opt-out controls
- Optional quiet hours
- Clear dismissal and expiration behavior for promotional popups
- Accessible UI and screen-reader labels
- Loading, empty, offline, and error states

Transactional notifications must not depend on promotional consent when they are necessary to complete or secure an order or account service. Promotional messages must respect explicit user preferences and applicable privacy requirements.

Push-notification implementation

For the Expo mobile application, evaluate the correct production approach for Expo Notifications, FCM, and APNs.

Implement:

- Device push-token registration
- Token association with authenticated users when applicable
- Guest-device handling where appropriate
- Token refresh and invalid-token cleanup
- Multiple devices per user
- Sign-out behavior
- Android notification channels
- iOS permission handling
- Foreground notification behavior
- Background and terminated-app navigation
- Deep-link validation
- Provider error handling
- Secure server-side credentials and environment variables

Never place private FCM, APNs, service-account, or provider credentials in client code or commit them to the repository.

Dynamic event integration

Connect the notification service to real application events rather than hard-coding one-off sends.

Examples:

- Order creation emits an order-created event
- Admin order status changes emit an order-status-changed event
- Delivery completion can schedule a feedback survey
- A newly published product can optionally trigger a targeted campaign
- A newly published event can trigger an event announcement
- A scheduled event can trigger reminders
- A promotion can automatically expire
- Account/security changes can emit appropriate alerts

Event handlers must be idempotent so retries cannot generate duplicate user notifications.

Data model and API

Add the necessary database migrations, indexes, constraints, API endpoints, authorization checks, and validation.

Consider entities such as:

- Notification templates
- Notifications
- Notification recipients
- Delivery attempts
- Device tokens
- Notification preferences
- Campaigns
- Audience definitions
- Surveys
- Survey questions
- Survey responses
- Notification events or outbox records

Use the transactional outbox pattern, or an equally reliable design, for business-critical event delivery if it fits the existing architecture.

Secure all admin notification endpoints. A customer must only be able to access and update their own notifications, device tokens, preferences, and survey responses.

Reliability and security

Apply production best practices:

- Schema validation
- Authorization and role checks
- Rate limiting
- Input sanitization
- Safe rich-content rendering
- URL and deep-link allowlists
- Idempotency keys
- Retry limits with exponential backoff
- Dead-letter or permanently failed state
- Scheduled-job locking
- Protection against duplicate workers
- Token revocation and cleanup
- Minimal personal-data storage
- Retention and deletion rules
- Structured logs without exposing tokens or personal information
- Monitoring-friendly metrics
- Time-zone-safe scheduling
- UTC storage
- Database transactions where necessary

Do not log authentication tokens, device tokens, OTPs, personal addresses, or notification-provider credentials.

Localization

Design templates so English and Arabic can be supported without duplicating business logic. If full Arabic copy is outside the current scope, implement the data structure and fallback behavior required to add it later.

Backward compatibility

Preserve all current store, account, checkout, order, event, predictor, and admin functionality.

Do not:

- Replace working systems unnecessarily
- Introduce a second authentication model
- Duplicate customer or order data
- Break current APIs
- Hard-code production domains, secrets, user IDs, or provider credentials
- Couple core order processing to a notification-provider response
- claim successful delivery before receiving an appropriate provider result

Implementation process

1. Audit the repository and document the relevant architecture.
2. Identify existing notification-like behavior, email, WhatsApp, popup, order, account, event, and scheduling code.
3. Present a concise architecture and implementation plan based on the actual project.
4. Implement the system end to end.
5. Add migrations and seed data where appropriate.
6. Add backend services and APIs.
7. Integrate real order and content events.
8. Add admin notification management.
9. Add mobile notification registration, reception, inbox, preferences, and deep links.
10. Add appropriate web notification and popup behavior.
11. Add tests.
12. Run linting, type checks, builds, migrations, and relevant automated tests.
13. Manually verify the main notification flows.
14. Document configuration, deployment, provider setup, and operational procedures.

Testing requirements

Add meaningful tests covering:

- Notification creation
- Audience selection
- User preference enforcement
- Transactional versus promotional behavior
- Template rendering
- Scheduling
- Idempotency
- Retry behavior
- Duplicate prevention
- Order status triggers
- Token registration and removal
- Read/unread state
- Deep-link routing
- Authorization boundaries
- Survey submission
- Campaign expiration
- Invalid or expired push tokens
- Provider outages

Deliverables

When finished, provide:

1. Architecture summary
2. List of implemented capabilities
3. Database changes and migrations
4. API endpoint documentation
5. Admin workflow documentation
6. Mobile and web behavior summary
7. Environment variables and external provider setup
8. Files changed
9. Tests and verification results
10. Remaining limitations or follow-up recommendations
11. Deployment and rollback instructions

Decision-making guidance

Make reasonable decisions based on the existing architecture. Ask questions only when a missing business decision or credential genuinely blocks implementation.

If external notification credentials are unavailable, fully implement the provider abstraction, local development adapter, persistence, APIs, UI, and configuration placeholders. Clearly document the exact production credentials and console setup still required.

Favor maintainable, incremental changes over a large rewrite. The final result must be production-oriented, observable, privacy-conscious, and easy to extend with new notification types and delivery providers.