# auth/auth-events Specification

## Purpose
Keeps a record of authentication failures and security-relevant events long enough to investigate them, and alerts admins when they spike or when mail stops going out.

## Requirements

### Requirement: Security-relevant auth events are recorded

grnyte SHALL record each failed re-authentication, each account deletion and each refusal of a mail for an exhausted mail quota in its own auth event log, with the time, the kind, the account where known, and no address, code or password. Recording SHALL never make the action it describes fail.

#### Scenario: Wrong code

- **WHEN** a person enters a wrong re-authentication code
- **THEN** an event of that kind is recorded for the account, without the code

#### Scenario: Log unavailable

- **WHEN** recording an event fails
- **THEN** the action continues and the failure is logged as a server failure

### Requirement: Auth logs are kept for 90 days

Rows in grnyte's auth event log and in the authentication service's own audit log SHALL be deleted once they are older than 90 days.

#### Scenario: Old rows

- **WHEN** the cleanup runs
- **THEN** both logs hold nothing older than 90 days

### Requirement: Admins are alerted on spikes

When more than 20 events of one failure kind are recorded within an hour, app admins SHALL be alerted, at most once per kind per day.

#### Scenario: A burst of wrong codes

- **WHEN** 21 wrong re-authentication codes are recorded within an hour
- **THEN** admins receive one alert naming the kind, and no second one that day

### Requirement: Admins are alerted when the mail quota runs out

When grnyte's mailer reports an exhausted quota or rate limit, or the authentication service refuses a mail for its send limit, app admins SHALL be alerted through the existing server-error alert (push first, mail where push fails), with every such refusal reported under one message so they arrive as one alert about once a day.

#### Scenario: Quota exhausted

- **WHEN** a sign-up's confirmation mail is refused for the send limit
- **THEN** the sign-up screen says the mail could not be sent and to try again later, an event is recorded, and admins are alerted once that day, however many mails of different kinds were refused
