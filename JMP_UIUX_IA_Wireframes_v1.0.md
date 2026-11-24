**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

### **JOB MARKETPLACE** 

# **UI/UX Information Architecture & Responsive Wireframes** 

Web MVP  •  Desktop + Mobile  •  Multi-capability account model 

_A navigable design baseline for public discovery, candidate, employer and admin experiences_ 

|**Document control**|**Value**|
|---|---|
|Document ID|JMP-UX-001|
|Version / status|1.0 / UX design baseline|
|Date|24 November 2026|
|Jira item|JMP-22 - Define UI/UX information architecture and responsive wireframes|
|Related documents|JMP SRS v1.0 · Logical ERD v1.0 · Architecture Design v1.0 · API Standards v1.0|
|Release boundary|Responsive web MVP; backend API remains available for future mobile clients|



##### **DESIGN PRINCIPLE** 

**One person can discover jobs, apply, and hire through one user identity.** 

JMP-UX-001  |  v1.0  |  1 

**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

## **1. Purpose and design principles** 

This baseline maps the approved MVP requirements into user-facing information architecture, primary journeys, responsive behavior and low-fidelity screen structures. It covers the public marketplace, job seeker workspace, employer workspace and permission-protected administration portal. 

|**Principle**|**Design implication**|
|---|---|
|Public-first discovery|Visitors can search and read published job details without signing in. Login is required only<br>for personalized or protected actions such as saving and applying.|
|One identity, multiple<br>capabilities|A single user can act as job seeker and employer. Candidate and employer workspaces are<br>destinations/capabilities, not mutually exclusive account types.|
|Explicit employer context|Employer pages show the active employer account and a visible account switcher. All job and<br>applicant actions remain scoped to that account.|
|Trust and transparency|Verified employer signals, job terms, workplace, location, salary disclosure and deadline are<br>visible close to the job title and apply action.|
|Progressive forms|Long forms are grouped into logical sections with labels, help text, validation and clear<br>save/continue actions.|
|Responsive by default|Navigation, filters, tables and primary actions adapt to touch-sized layouts; mobile is not a<br>compressed desktop screenshot.|
|Accessible interaction|Use semantic headings, keyboard-operable controls, visible focus, descriptive labels and<br>WCAG 2.2 AA contrast targets.|
|International-ready data|Show currency with ISO code, country and city clearly; keep layout copy ready for localization<br>and longer translated labels.|



## **2. Information architecture and navigation** 

#### **2.1 Global navigation shell** 

- Public header: brand/home, Find jobs, For employers, sign in and create account. Public job detail pages remain shareable and indexable when published. 

- Authenticated account menu: personal settings, notifications and a workspace switcher listing only capabilities the user actually has. 

- Candidate workspace: overview, profile, resumes, applications, saved jobs and notifications. 

- Employer workspace: account selector, overview, jobs, applicants, company profile, team/members, verification and settings. 

- Admin portal: platform overview, employer verification, job moderation, reports, user administration and audit log; visibility and access depend on platform permissions. 

#### **2.2 Sitemap** 



_Figure 1. High-level navigation map. Access to authenticated workspaces is permission/capability-based, not selected as an exclusive role during registration._ 

#### **2.3 Route and page catalogue** 

|**Area**|**Route / page**|**Primary purpose**|
|---|---|---|
|Public|/|Discover the marketplace, categories and recent jobs.|
|Public|/jobs|Search and filter all published jobs.|
|Public|/jobs/:jobId|Read full job details and start application/save flow.|
|Public|/companies/:slug|Public employer information and published jobs.|
|Identity|/login · /register · /forgot-password · /verify-email|Create or recover access to a single user identity.|



JMP-UX-001  |  v1.0  |  2 

**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

|**Area**|**Route / page**|**Primary purpose**|
|---|---|---|
|Candidate|/candidate|Candidate overview and progress.|
|Candidate|/candidate/profile · /candidate/resumes|Maintain profile, experience, skills and private<br>resumes.|
|Candidate|/candidate/applications · /candidate/applications/:id|Track submitted applications and allowed actions.|
|Candidate|/candidate/saved-jobs|Review saved jobs.|
|Employer|/employer|Employer overview for selected employer account.|
|Employer|/employer/jobs · /employer/jobs/new ·<br>/employer/jobs/:id/edit|Manage job drafts, publication and closure.|
|Employer|/employer/applicants · /employer/applicants/:id|Review candidates and progress applications.|
|Employer|/employer/company · /employer/team ·<br>/employer/verification|Maintain account, members and verification.|
|Admin|/admin|Permission-aware platform overview.|
|Admin|/admin/employer-verification · /admin/job-moderation|Review verification and pending job queues.|
|Admin|/admin/reports · /admin/users · /admin/audit-log|Resolve reports, administer users and inspect<br>sensitive-action history.|



## **3. Primary user journeys** 

#### **3.1 Visitor discovers and applies** 

- Open home page or direct job link. 

- Search by title/skill/company and location; refine by country, city, category, employment type, workplace, experience and disclosed salary range. 

- Open a job detail page; review role, employer verification, terms, salary, deadline and public employer profile. 

- Select Apply. If signed out, authenticate/register and return to the same job after success. 

- Select a resume and optionally add a cover letter; review and submit. The application receives a submitted status and preserves the submitted resume snapshot. 

- Track the application from the candidate workspace. 

#### **3.2 Candidate maintains profile** 

- Open candidate workspace from the account switcher. 

- Complete profile information, education, experience and skills. 

- Upload one or more resumes; show file type/size guidance, upload state and access controls. 

- Set a preferred/default resume if supported by implementation; select the exact resume at application time. 

- Review saved jobs, application states and notifications. 

#### **3.3 Employer creates and publishes a job** 

- Open employer workspace; select an individual or organization employer account. 

- Check active account name, role/permission and verification status in the workspace header. 

- Create a draft and complete role, work terms, location, salary, vacancy count and application deadline. 

- Preview the public job representation and save draft or submit/publish. 

- Verified, active employers can publish eligible jobs immediately. Unverified employers submit into PENDING_REVIEW; the interface explains the review state and does not imply publication. 

- Manage active jobs and review applications; status updates show only valid next transitions and preserve history. 

#### **3.4 Admin reviews a verification request or job** 

- Enter the restricted admin portal only when the user has the necessary platform permission. 

- Open the relevant review queue; filter by pending state, submission date and employer/job identity. 

- Inspect private evidence or job content through authorized, time-limited access. 

- Approve, reject or request additional information with an explicit reason/feedback. 

JMP-UX-001  |  v1.0  |  3 

**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

- Show the resulting state, reviewer, timestamp and audit history. 

## **4. Responsive behavior** 

|**Viewport**|**Layout rules**|**Navigation and interaction**|
|---|---|---|
|Desktop<br>1024 px<br>≥|Max-width content canvas; public results may use<br>filter sidebar + list; dashboards use side navigation<br>and multi-column metrics/tables.|Full top navigation, visible account context,<br>multi-column forms; tables may display all<br>key columns.|
||Reduce sidebars and card columns; move filters into|Use compact header; preserve primary|
|Tablet 768-1023 px|a collapsible panel when result area becomes<br>narrow.|actions; allow horizontal table scroll only for<br>dense data, with accessible row labels.|
|Mobile 360-767 px|Single-column content; cards stack; job detail<br>sections stack; form fields become full width;<br>dashboards use vertical metric cards.|Header uses menu button; employer context<br>stays visible; filters open as a sheet/drawer;<br>sticky Apply/Save actions appear on job<br>detail.|
|Small mobile < 360<br>px|Avoid fixed-width form controls; allow long labels<br>and chips to wrap; keep content within viewport.|Primary action buttons stack when needed;<br>maintain touch targets and readable text.|



Responsive decisions: use CSS breakpoints around 640 px and 920 px initially, then tune after testing common Android/iOS device widths. This is a baseline, not a substitute for device testing. Avoid hover-only interactions. Focus order must follow the visual order after layouts collapse. 

## **5. Screen wireframe inventory** 

|**#**|**Screen**|**Core structures / required content**|**Mobile adaptation**|
|---|---|---|---|
|01|Public home|Global header, keyword/location search, categories, recently<br>published jobs, verified employer signals.|Stack hero, search inputs and<br>category/job cards; compact<br>menu.|
|02|Search/results|Query bar, result count, filters, sort, job cards, pagination and<br>active filter chips.|Filters become a sheet; cards<br>stack; sort/filter actions remain<br>obvious.|
|||Breadcrumb, title/employer verification,|One column; sticky bottom|
|03|Job detail|location/type/salary/deadline, description, employer panel,<br>Apply/Save.|Apply/Save bar; content hierarchy<br>maintained.|
|04|Candidate dashboard|Overview metrics, recent applications, profile completeness,<br>resume summary, saved jobs.|Vertical cards; application status<br>labels stay visible.|
|05|Employer dashboard|Selected account context, verification state, job/applicant<br>metrics, recent job list, team/verification shortcuts.|Stack metrics; compact row cards<br>instead of wide tables.|
|06|Create/edit job|Role details, work terms, location/compensation,<br>deadline/vacancies, preview and save/submit actions.|Single-column form or stepper;<br>persistent draft action; bottom<br>action area.|
|07|Applicant review|Status filters, candidate list, candidate detail, immutable<br>resume snapshot, status transition and notes.|Candidate list opens detail view;<br>table becomes stacked list; action<br>menu remains reachable.|
|08|Register/sign in|Name/email/password, terms, verification expectation, sign-in<br>link and recovery route.|Single-column focused form;<br>validation appears beside fields.|
|09|Admin review|Queue metrics, filters, submission details, private evidence<br>access, decision feedback and audit context.|Queue cards; decision form in<br>full-width detail view; permission<br>checks remain.|



JMP-UX-001  |  v1.0  |  4 

**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

#### **5.1 Desktop wireframe preview** 



_Figure 2. Desktop wireframe contact sheet for public home, search, job detail, workspaces and core forms._ 

JMP-UX-001  |  v1.0  |  5 

**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

#### **5.2 Mobile wireframe preview** 



<!-- Start of picture text -->
—— ——<br>— o<br>——<br>—= parm<br>— es ——<br>="<br>=<br>7%<br>—<br>=<br>an|<br><!-- End of picture text -->

_Figure 3. Mobile previews show stacked content, filter controls and full-width form behavior. Open the standalone HTML file to inspect_ 

_each screen at arbitrary viewport widths._ 

JMP-UX-001  |  v1.0  |  6 

**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

## **6. Interaction and component behavior** 

|**Component**|**Behavior / requirement**|
|---|---|
|Global header and workspace<br>switcher|Show the active workspace and, for employer, the selected employer account. Preserve<br>destination on login. Hide unavailable destinations rather than advertising permissions a<br>user does not have.|
|i|Maintain query/filter state in URL query parameters so results can be shared/bookmarked.<br>i      i|
|Job search and filters|Clear individual or all filters. Show loading feedback and preserve filters when pagination<br>changes.|
|Job card and detail|Display verified employer indicator, location, work arrangement, employment type, salary<br>disclosure and age/deadline without forcing detail navigation for basic comparison.|
|Forms|Always label fields; use inline validation after blur/submit; show field-level errors and a<br>form-level summary for long forms. Distinguish required and optional fields.|
|Resume/file upload|Show allowed formats and maximum size from API configuration; provide progress,<br>completion and retry feedback; do not display raw storage URLs.|
|Status controls|Use meaningful status labels and only expose transitions valid for the current actor and<br>record state. Confirm irreversible/destructive actions.|
|Tables/lists|Provide clear empty states, filter summaries, status badges and accessible action names. On<br>mobile, use cards or row detail views rather than unreadable compressed tables.|
|Notifications|Use a visible unread count and consistent read/unread affordance; notification list is scoped<br>to the current user.|



## **7. Empty, loading, error and permission states** 

|**State**|**When to show**|**UX response**|
|---|---|---|
|Loading|Initial page load, filter request,<br>dashboard data, file upload or submit<br>in progress.|Use skeletons matching final content structure; disable duplicate<br>submission; show progress for uploads; avoid blank page<br>flashes.|
|Empty search|No jobs match current query/filters.|Explain no results; keep query and filters visible; offer clear<br>filters and broader location/criteria.|
|Empty dashboard|No applications, saved jobs, jobs or<br>applicants yet.|Provide a next action (search jobs, complete profile, create first<br>job); do not make the empty state look like an error.|
|Validation error|Field or form input rejected.|Show inline message adjacent to field, preserve valid data and<br>focus/announce the first invalid field.|
|Recoverable<br>server/network error|Temporary API failure or connectivity<br>loss.|Show safe message and retry action; preserve search/filter/form<br>state where safe.|
|Not found / expired|Job closed, expired or resource<br>removed.|Explain that the opportunity is no longer accepting applications;<br>offer similar jobs and return to results.|
|Permission denied|Actor lacks employer<br>membership/permission or admin<br>permission.|Show a clear access message and a safe return path; do not<br>reveal private records or admin controls.|
|Session expired|Access credential invalid/expired.|Request re-authentication and return the user to their intended<br>destination after successful login.|
|Verification<br>pending/rejected|Employer is not currently eligible for<br>immediate publishing.|Display pending/rejected state, decision feedback and permitted<br>next steps; never imply that a pending job is publicly visible.|



## **8. Accessibility, content and visual system** 

- Target WCAG 2.2 AA for contrast, focus visibility, keyboard operation, target size and error identification. 

- Use semantic landmarks (header, nav, main, aside, footer), a single clear page H1 and logical H2/H3 hierarchy. 

- Do not communicate job or application status by color alone; pair status badges with readable text and accessible labels. 

- Ensure all controls have labels; all icon-only buttons have accessible names; menus and dialogs manage focus correctly. 

- Search filters and application forms should be usable without a pointer. Do not rely only on hover or drag actions. 

JMP-UX-001  |  v1.0  |  7 

**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

- Use readable line lengths, consistent spacing, visible form required/optional indicators and plain language. 

- Localization-ready layout: avoid hard-coded width assumptions; support long employer names, long translated labels, multiple currencies and different country/city formats. 

## **9. Traceability to MVP requirements** 

|**SRS requirement family**|**Covered screens / design evidence**|
|---|---|
|FR-PUB-001..008|Home, search/results, job detail, employer public profile, saved-job entry point, URL-backed<br>filters and pagination.|
|FR-AUTH-001..007|Shared registration/login/recovery, email verification state, user menu and capability-aware<br>workspace access.|
|FR-EMP-001..008|Employer account switcher, company profile, team, verification state and pending/suspended<br>operation explanations.|
|FR-JOB-001..008|Create/edit job form, draft/preview/submit flow, publication status messaging, job<br>management and status history affordance.|
|FR-CAN-001..006|Candidate overview, profile/resume management entry points and immutable submitted-<br>resume indication.|
|FR-APP-001..007|Apply flow, resume selection, cover letter, candidate application list and employer applicant<br>review/status control.|
|FR-NOT-001..003|Notification entry point, unread state and notification settings.|
|FR-ADM-001..004|Admin overview, employer verification queue, job moderation, reports, audit log and<br>permission-gated routes.|



## **10. Open decisions for implementation** 

|**Decision**|**Baseline / recommendation**|**Resolve during**|
|---|---|---|
|Brand identity, logo and<br>color palette|Use the navy/teal neutral wireframe palette as a placeholder<br>only.|Visual design task / brand review.|
||English UI for MVP with localization-ready strings and||
|Language support|layouts; Amharic and other languages may be prioritized<br>after stakeholder review.|Product/l10n planning.|
|Mobile filter interaction|Bottom sheet or full-height drawer depending on device<br>width and filter length.|Frontend implementation and<br>usability test.|
|Job form structure|Stepper/sections as shown; keep a Save draft path accessible<br>throughout.|Job publishing implementation.|
|Dashboard analytics|Show only metrics supported by MVP data; avoid unverified<br>performance charts.|Frontend/backend story refinement.|
|Public employer profile<br>URL|Slug-based public route with immutable ID fallback for<br>routing.|SEO/public page implementation.|



## **Appendix A. Wireframe source and use** 

The standalone HTML wireframe file is self-contained and uses CSS media queries. Open it in a browser and resize the viewport to inspect desktop, tablet and mobile behavior. The anchors at the top jump to each of the nine screens. Sample employer names, metrics and job content are illustrative placeholders, not production data. 

Suggested implementation alignment: use React Router nested layouts for public, candidate, employer and admin sections; retain one authenticated user context; resolve active employer account context from the selected account; and enforce all permissions in the API rather than relying on navigation visibility. 

JMP-UX-001  |  v1.0  |  8 

**JOB MARKETPLACE  /  UI-UX INFORMATION ARCHITECTURE** 

## **Appendix B. Document control and acceptance** 

|**JMP-22 acceptance criterion**|**Evidence in this baseline**|
|---|---|
|Navigation map covers public and<br>authenticated areas.|Sections 2.1-2.3 and Figure 1. Public, candidate, employer and admin routes<br>are mapped.|
|Wireframes cover home, search/results, job|Section 5 and nine-screen responsive HTML wireframe preview; desktop and|
|details, dashboards and key forms.|mobile contact sheets.|
|Responsive behavior is specified.|Section 4 defines desktop, tablet, mobile and small mobile behavior; CSS<br>previews included.|
|Empty, loading, error and permission-|Section 7 defines loading, empty, validation, recoverable error, not found,<br>i|
|denied states are considered.|denied, expired session and verification states.|



JMP-UX-001  |  v1.0  |  9 

