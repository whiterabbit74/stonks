# URL: https://developer.webull.com/apis/docs/AI-friendly-Resources/llm

* AI-friendly-Resources
* llms.txt

On this page

# llms.txt

Webull OpenAPI offers trading APIs, market data services, OAuth integration, and SDK tools for building trading applications and brokerage solutions. To support AI-assisted development, the documentation is published in machine-readable formats so that Large Language Models can reference it directly — helping you generate more accurate integration code, troubleshoot faster, and explore the API with AI tools.

## Machine-Readable Documentation (llms.txt)[​](#machine-readable-documentation-llmstxt "Direct link to Machine-Readable Documentation (llms.txt)")

To make AI-assisted development easier, the Webull OpenAPI documentation is published in the [llms.txt](https://llmstxt.org/) format — a lightweight standard that gives LLMs a complete, structured reference of the API.

**Index file:**

<https://developer.webull.com/apis/llms.txt>

Every documentation page also has a Markdown variant. Append `.md` to any page URL to get the raw Markdown content, which is ideal for feeding into LLMs, RAG pipelines, or documentation crawlers.

| Page URL | Markdown URL |
| --- | --- |
| `https://developer.webull.com/apis/docs/about` | [about.md](https://developer.webull.com/apis/docs/about.md) |
| `https://developer.webull.com/apis/docs/trade-api/overview.md` | [trade-overview.md](https://developer.webull.com/apis/docs/trade-api/overview.md) |

Fetch Markdown content from the command line:

curl `https://developer.webull.com/apis/docs/about.md`

## Integration Guide[​](#integration-guide "Direct link to Integration Guide")

### Cursor[​](#cursor "Direct link to Cursor")

1. Open the command palette (`Command + Shift + P`) and select **Add New Custom Docs**.
2. Paste the llms.txt URL:

   `https://developer.webull.com/apis/llms.txt`
3. In any AI conversation, use **@Add Context** → **docs** to attach the Webull OpenAPI reference. The AI will use it as context for code generation and Q&A.

### Kiro[​](#kiro "Direct link to Kiro")

In [Kiro](https://kiro.dev), you can add the llms.txt as a steering file or reference it directly in chat using `#URL` to give the AI full context of the Webull OpenAPI documentation.

### Other AI Tools[​](#other-ai-tools "Direct link to Other AI Tools")

The llms.txt URL works with any tool that accepts external documentation as context — including RAG pipelines, MCP servers, and general-purpose AI coding assistants.

```
https://developer.webull.com/apis/llms.txt
```

### Test Environment[​](#test-environment "Direct link to Test Environment")

```
HTTP API: us-openapi-alb.uat.webullbroker.com  
Trading message push: us-openapi-events.uat.webullbroker.com
```

### Production Environment[​](#production-environment "Direct link to Production Environment")

```
HTTP API: api.webull.com  
Trading message push: events-api.webull.com  
Market data message push: data-api.webull.com
```

## Test Accounts[​](#test-accounts "Direct link to Test Accounts")

The following information are for Trading API & Market Data API integration. You will no need to apply account seperately in test environment.

Note: since these accounts are shared publically, the orders and positions on the account may change. If you do need a seperate account for your testing, please reach out to our support team.

| No. | Test Account ID | Test App Key | Test Secret Key |
| --- | --- | --- | --- |
| 1 | J6HA4EBQRQFJD2J6NQH0F7M649 | a88f2efed4dca02b9bc1a3cecbc35dba | c2895b3526cc7c7588758351ddf425d6 |
| 2 | HBGQE8NM0CQG4Q34ABOM83HD09 | 6d9f1a0aa919a127697b567bb704369e | adb8931f708ea3d57ec1486f10abf58c |
| 3 | 4BJITU00JUIVEDO5V3PRA5C5G8 | eecbf4489f460ad2f7aecef37b267618 | 8abf920a9cc3cb7af3ea5e9e03850692 |

---

# URL: https://developer.webull.com/apis/docs/about

* About Webull

On this page

# About Webull

### Introduction[​](#introduction "Direct link to Introduction")

Securities trading is offered to self-directed customers by Webull Financial LLC, a broker dealer registered with the Securities and Exchange Commission (SEC). Webull Financial LLC is a member of the Financial Industry Regulatory Authority (FINRA), Securities Investor Protection Corporation (SIPC), The New York Stock Exchange (NYSE), NASDAQ and Cboe EDGX Exchange, Inc (CBOE EDGX).

Webull is a customer-centric financial company, rooted in the internet and driven by technology at its core.

With years of experience in the internet and financial industries, the Webull team is committed to the deep integration of technology and finance, providing safe, professional, intelligent, and efficient products and services that let clients enjoy technology and enjoy investing.

We believe that individual investors are an important part of the market, not just “fodder.” Individual investors deserve better information, tools, services, trading opportunities, and trading costs. Respecting investors is respecting the market.

Machines are excellent assistants for human traders and will greatly augment human capabilities in trading hours, trading space, and trading technology. Algorithmic trading is an important trend for the future.

By empowering finance through technology, Webull provides a seamless one-stop self-directed investment platform and advanced intelligent investment tools for an excellent experience.

---

# URL: https://developer.webull.com/apis/docs/about-open-api

* About Webull OpenAPI

On this page

# About Webull OpenAPI

## Overview[​](#overview "Direct link to Overview")

Webull OpenAPI is designed to provide convenient, fast, and secure quantitative trading services to quantitative trading investors. It helps every client with quantitative trading needs to implement flexible and diverse trading or market data strategies.

## Target Users[​](#target-users "Direct link to Target Users")

Webull OpenAPI is mainly aimed at investors who have certain coding abilities and a reasonable understanding of quantitative trading.

## Prerequisites and Configuration[​](#prerequisites-and-configuration "Direct link to Prerequisites and Configuration")

### Interface Protocols[​](#interface-protocols "Direct link to Interface Protocols")

Webull OpenAPI provides HTTP and MQTT protocols at the underlying level to support functions such as trading and real-time market data subscriptions, and also offers gRPC to support order status change subscriptions.

| Protocol | Description |
| --- | --- |
| HTTP | Mainly provides interface services for trading, account, market candlestick bars, snapshot, and other data. |
| gRPC | Provides real-time message push for order status changes. |
| MQTT | Provides data streaming services for real-time market data. |

### How to Activate[​](#how-to-activate "Direct link to How to Activate")

* individual

First, you must register as a Webull user on the [Webull official website](https://www.webull.com/), and then you need to open a Webull US brokerage account.

After obtaining a Webull US brokerage account, you need to go to the [Webull official website](https://www.webull.com/) under the **OpenAPI Management** section, click on **My Applications**, and apply for API services.

Once your API service application is approved, go to **App Management** to create an application. After the application is created, you will need to click **Generate Key** to generate an API key.

For more detailed information, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

Note

Modifying information, generating keys, or resetting keys cannot be performed more than `3` times per day.

## Transaction Core Rules[​](#transaction-core-rules "Direct link to Transaction Core Rules")

### Supported Markets[​](#supported-markets "Direct link to Supported Markets")

| Market |
| --- |
| United States |

### Trading Products & Market Data[​](#trading-products--market-data "Direct link to Trading Products & Market Data")

| Core Category | Specific Coverage |
| --- | --- |
| Trading Products | Stocks, Single-stock Options (excluding Index Options), Futures, Cryptos, Event Contracts |
| Market Data Services | US Stocks (NYSE, NASDAQ, and other major exchanges), US Overnight Session Data, Futures (CME Group quotes), Cryptos, Event Contracts |

### Usage Fees[​](#usage-fees "Direct link to Usage Fees")

**Market Data:**

| Market | Category | Permission Acquisition |
| --- | --- | --- |
| US Market | Securities Products (Stocks, ETFs, Night Session) | To obtain permission to access U.S. stock market data, please purchase Level 1 and Level 2 market data for U.S. stock.  Note:Subscriptions in QT or the mobile app are independent of OpenAPI. You need a separate data subscription specifically enabled for OpenAPI usage. Only one device may access LV1 and LV2 at any one time. |
| US Market | Futures | Not supported yet. Coming soon. |
| US Market | Crypto |  |
| US Market | Event Contracts | Free for use - retail clients only |

## Special trading features[​](#special-trading-features "Direct link to Special trading features")

### Fractional Trading[​](#fractional-trading "Direct link to Fractional Trading")

Minimum order is 0.00001 shares or $1.00 per transaction, For Fractional trading minimum for sell is $0.01

Unlock the potential of fractional shares investing and take control of your financial future. With Webull, you can buy fractional shares of your favorite stocks or ETFs, enabling fractional stock ownership without purchasing an entire share.
With fractional shares, you can invest in a way that suits your budget and goals. Decide how much you'd like to invest, and Webull will calculate the corresponding fraction of shares. This straightforward approach helps you grow your portfolio with flexibility and ease.

We only allow market orders for fractional trading at the moment.

---

# URL: https://developer.webull.com/apis/docs/authentication/IndividualApplicationAPI

* Authentication
* Individual Application Process

On this page

# Individual Application Process

## API Application[​](#api-application "Direct link to API Application")

1. Open [Webull official website](https://www.webull.com/). Click the login button in the upper right corner to log in as a user (if you don't have a Webull user number, please click the [Sign up] button to register first).
   ![img.png](/apis/assets/images/home_page-217dc4fdd8a790210b5e700a1cac329a.png)
2. After logging in, the page will automatically jump to the account center. If there is no active jump, you can also click [Developer Tool] on the avatar in the upper right corner to jump to the developer center.
   ![image](https://u1sweb.webullfinance.com/inst-bo/NMJ4BAA7OLCLB8S1PVUFHU4CBB.png)
   The account center page is as follows:
   ![img.png](/apis/assets/images/account_center-7dd82ed64b3c0a903e6565e9892ade8f.png)
   If you don’t have an account, you need to open one before applying for the API.
   ![img.png](/apis/assets/images/account_center_no_open_account-ceeadc26492eea53196e4b0df3eecc5d.png)
3. After opening an account, click [API Management] -> [My Application] to apply for API.
   ![img.png](/apis/assets/images/api_apply-9fa1b10730918ed2251a6a414e89506e.png)

caution

After the API application, Webull needs to review the application. It is estimated that the process will take 1 to 2 working days at the earliest.

4. After the application is completed, an email will be sent to the email address you filled in when opening an account. You can also view it in [API Management] -> [My Application] on the [Webull official website](https://www.webull.com/), as shown below:
   ![img.png](/apis/assets/images/api_apply_complete-cffe766a967e5da1260016ae1dadffe7.png)

## Register an API Application[​](#register-an-api-application "Direct link to Register an API Application")

1. After the API application is approved, you can start registering the application in [API Management] -> [Application Management].
   ![img.png](/apis/assets/images/app_register-24f44f9c6a1ddd79de50062857d9756e.png)
2. Enter your application name and click the box "I have read and accept Webull OpenAPI Agreement" to register the application.
   ![img.png](/apis/assets/images/app_register_commit-fb3c93626727cf4cac99305ae25337f4.png)
3. After the registration is complete, you need to click [Generate Key] to generate the key. During the key generation process, SMS verification code and transaction password verification are required.
   ![img.png](/apis/assets/images/app_register_complete-7c38a01ecc97eed16ce94e624590603a.png)
   The following is an example after the key is generated, including the App Key, App Secret.
   ![img.png](/apis/assets/images/app_key-240a2c1acc14b51826e6cac208e3468f.png)
4. you can also click [Reset Key] to reset the App Secret.
   ![img.png](/apis/assets/images/app_reset_secret-89f9c76b0f14c09e7af27ea33053afb6.png)

---

# URL: https://developer.webull.com/apis/docs/authentication/apply

* Authentication
* Institution Application Process

On this page

# Institution Application Process

Note

For administrators (with function permission: [User Management] as well as [OpenAPI Application]), you need to complete the Open API Services application, then grant Open API Access to users within your organization, allowing them to create their own app keys and secret keys (AK/SK) and manage accounts through API.

For non-administrator users, you must first contact an administrator to enable Open API Access, then go to [create api keys application](#create-api-keys-application) and, following the page instructions, create your personal Open API Keys application in the Developer Center.

## Apply for Open API Services[​](#apply-for-open-api-services "Direct link to Apply for Open API Services")

* Prod

1. Open the [Webull Portal Prod](https://passport.webull.com/securities/auth/login?source=seo-direct-home&hl=en&redirect_uri=https%3A%2F%2Fportal.webull.com%2Fcenter). Log in using your Webull registered account. (If you do not have a Webull account yet, please click the Register button to sign up first.)
   ![img.png](/apis/assets/images/home_page-2b833b8a53cec2853269fe28f0b10ff1.png)
2. After logging in, please click the Open API >> OpenAPI Application to apply for the API.
   ![img.png](/apis/assets/images/api_apply-217961c2eb632e965f14b61f59d16de6.png)
   If you have not opened an account, click the [Open Account] button and follow the instructions to submit your account opening information. You will need to wait until the account opening is completed before you can apply for the API.
   ![img.png](/apis/assets/images/account_center_no_open_account-d06072f0d099f824cad8379d121a7e0b.png)

   Note

   After submitting your API application, it will be reviewed by Webull operations staff. The review is expected to take 1 to 2 business days at the fastest.
3. Once your application is approved, an email will be sent to the email address you provided during account registration. You can also view the status under [Open API] -> [OpenAPI Application] in the [Webull Portal Prod](https://passport.webull.com/securities/auth/login?source=seo-direct-home&hl=en&redirect_uri=https%3A%2F%2Fportal.webull.com%2Fcenter), as shown below:
   ![img.png](/apis/assets/images/api_apply_complete-caef68053fc1d8151bdda6081f4e7363.png)

## Open API Access Authorization[​](#open-api-access-authorization "Direct link to Open API Access Authorization")

1. The admin can go to [User Management] to grant Open API Access to users in your organization. Once authorized, users can generate their own API keys and perform operations with them.
   ![img.png](/apis/assets/images/open_api_access_account-971ac761868d6b5a66cdc6e863f21258.png)
   ![img.png](/apis/assets/images/openAPI_access-2e0184a870f12fe7ebd6f97921bbc38e.png)

## Create API Keys Application[​](#create-api-keys-application "Direct link to Create API Keys Application")

Below is an example after key generation, which includes your Permissions, and the IP whitelist you have set.

1. To Check if you have been enabled Open API access by the institution administrator, please go to [Open API] -> [My OpenAPI Access].
   ![img.png](/apis/assets/images/app_register-a96ed744cb69985cb85496fab766f0d6.png)
   If you do not have OpenAPI access rights, the [My OpenAPI Access] page will display as follows.
   ![img.png](/apis/assets/images/unauthorized-60a6e8ba3d629c68d890aa25eae57d74.png)

   note

   You can contact the institution administrator to grant access rights to OpenAPI.
2. If your OpenAPI Access has been enabled already, you can click Go To Website to View to jump into the [Developer Tools Center] login page. You will be asked to login again with the same login credential.
   ![img.png](/apis/assets/images/app_register_login-4006d96e456440098fc7922ce4d6c203.png)
   ![img.png](/apis/assets/images/app_register_commit-33a87ce34090209354ae4da10ed16aa4.png)
   ![img.png](/apis/assets/images/app_register_form-8a6b974b37c76f63bb833ecb78d7c4c8.png)
3. After registration is complete, click [Generate Key] to create your app key. During the key generation process, you will need to complete SMS verification and `MFA code` verification.

   ![img.png](/apis/assets/images/new_api_check-4402128972b4c4643ab2558873e405fd.png)
   ![img.png](/apis/assets/images/generateKey-edcf44fe6b1df35609d3a71c6087caee.png)
4. When you need to reset your Secret, you can click [Reset Key] to reset your App Key.
   ![img.png](/apis/assets/images/app_reset_secret-252dd9f041e82cb7f97326f5bc59442a.png)

---

# URL: https://developer.webull.com/apis/docs/authentication/overview

* Authentication
* Overview

# Overview

Webull OpenAPI employs a digest signature authentication mechanism that uses `App Key` and `App Secret` to ensure the security of API calls. When making API requests, the client uses the `App Secret` to calculate a signature for the request content and sends the generated signature along with the request to the server for authentication.
The `Webull SDK` has built-in comprehensive signature functionality, so developers only need to properly configure the App Key and App Secret in the SDK.

All API requests must be made over HTTPS. Calls made over HTTP will fail. Unauthenticated API requests will also fail.

You can view and manage your `App Key` and `App Secret` in the [Webull Official Website](https://www.webull.com).

danger

Your `App Key` and `App Secret` contain important access permissions, so please keep them secure! **Never** expose your
`App Key` and `App Secret` in any public places (such as GitHub, client-side code, forums, etc.).

---

# URL: https://developer.webull.com/apis/docs/authentication/signature

* Authentication
* Signature

On this page

# Signature

## Signature Overview[​](#signature-overview "Direct link to Signature Overview")

API request signatures are values generated from the request content and a secret key using a specific signature algorithm. This cryptographic approach ensures the integrity and authenticity of the API request data, prevents tampering during transmission, and verifies the identity of the request originator. To ensure secure communication between both parties, when using the OpenAPI, Webull performs security verification for each API request through the signature. Regardless of whether you submit requests via HTTP or HTTPS, you must include the signature value in the **request header** as shown:

```
x-signature: signature_value
```

NOTE

The Webull SDK has already encapsulated the signature process, so if you are using the Webull SDK, no extra handling is needed. This article provides a detailed explanation of how the signature value is generated.

## Signature Composition[​](#signature-composition "Direct link to Signature Composition")

The signature content consists of four parts:

* HTTP request path
* HTTP request query params
* HTTP request body
* HTTP request headers

caution

* The contents being signed do **not** require [URL Encoding](https://en.wikipedia.org/wiki/Percent-encoding)
* For HTTP POST requests, `Content-Type` must be `application/json`.

The relevant signature headers are:

| Name | Description |
| --- | --- |
| x-app-key | `App Key` |
| x-signature-algorithm | Signature algorithm, default is `HMAC-SHA1` |
| x-signature-version | Signature algorithm version, default is 1.0 |
| x-signature-nonce | Signature nonce, regenerate for each request |
| x-timestamp | [RFC-3339](https://datatracker.ietf.org/doc/html/rfc3339) formatted request timestamp, format: `YYYY-MM-DDThh:mm:ssZ`, e.g. 2023-07-16T19:23:51Z, **only supports UTC timezone** |
| host | The request's Host in `host:port` format, e.g. `api.webull.com:8080` or `api.webull.com` |

## Signature Rules[​](#signature-rules "Direct link to Signature Rules")

### Content Participating in the Signature[​](#content-participating-in-the-signature "Direct link to Content Participating in the Signature")

```
1. HTTP request path  
2. HTTP request query params  
3. HTTP request body   
4. HTTP request headers: x-app-key、x-signature-algorithm、x-signature-version、x-signature-nonce、x-timestamp、host
```

### Constructing the Signature Content[​](#constructing-the-signature-content "Direct link to Constructing the Signature Content")

1. Sort all parameter names (from both request params and headers) in ascending string order.
2. Join the parameter names and values in order as `name1=value1&name2=value2` to create a new string called **str1**.
3. Use [MD5](https://en.wikipedia.org/wiki/MD5) to produce a 128-bit (16-byte) hash value for the body parameters and convert it to uppercase: toUpper(MD5(body)). Call this string **str2**.
4. Join `path`, `&`, `str1`, `&`, `str2` in order to create a new string called **str3**.
5. URL encode `str3` to get **encoded\_string**.

CAUTION

* There must be **no** spaces between body parameter keys and values.
* If the body is empty, then `str3 = path + "&" + str1`

### Constructing the Key[​](#constructing-the-key "Direct link to Constructing the Key")

Append the character `&` to the end of your `App Secret` to get **`app_secret`**.

### Generating the Signature[​](#generating-the-signature "Direct link to Generating the Signature")

Algorithm:

```
signature = base64(HMAC-SHA1(app_secret, encoded_string))
```

## Example[​](#example "Direct link to Example")

### Request Contents[​](#request-contents "Direct link to Request Contents")

**Request Path:**

```
/trade/place_order
```

**Request Query Parameters:**

| Name | Example Value | Note |
| --- | --- | --- |
| a1 | webull | No URL Encoding needed |
| a2 | 123 | No URL Encoding needed |
| a3 | xxx | No URL Encoding needed |
| q1 | yyy | No URL Encoding needed |

**Request Headers:**

| Name | Example Value | Note |
| --- | --- | --- |
| x-app-key | 776da210ab4a452795d74e726ebd74b6 | No URL Encoding needed |
| x-timestamp | 2022-01-04T03:55:31Z | No URL Encoding needed |
| x-signature-version | 1.0 | No URL Encoding needed |
| x-signature-algorithm | HMAC-SHA1 | No URL Encoding needed |
| x-signature-nonce | 48ef5afed43d4d91ae514aaeafbc29ba | No URL Encoding needed |
| host | api.webull.com | No URL Encoding needed |

**Request Body：**

```
{"k1":123,"k2":"this is the api request body","k3":true,"k4":{"foo":[1,2]}}
```

**App Secret：**

```
0f50a2e853334a9aae1a783bee120c1f
```

### Step 1: Constructing The Request Content[​](#step-1-constructing-the-request-content "Direct link to Step 1: Constructing The Request Content")

1. Sort all parameter names in ascending string order, resulting in:

   ```
   Parameter name: a1, value: webull  
   Parameter name: a2, value: 123  
   Parameter name: a3, value: xxx  
   Header name: host, value: api.webull.com  
   Parameter name: q1, value: yyy  
   Header name: x-app-key, value: 776da210ab4a452795d74e726ebd74b6  
   Header name: x-signature-algorithm, value: HMAC-SHA1  
   Header name: x-signature-nonce, value: 48ef5afed43d4d91ae514aaeafbc29ba  
   Header name: x-signature-version, value: 1.0  
   Header name: x-timestamp, value: 2022-01-04T03:55:31Z
   ```
2. Join parameter names and values in order to get **str1**:

   ```
   # str1  
   str1 = "a1=webull&a2=123&a3=xxx&host=api.webull.com&q1=yyy&x-app-key=776da210ab4a452795d74e726ebd74b6&x-signature-algorithm=HMAC-SHA1&x-signature-nonce=48ef5afed43d4d91ae514aaeafbc29ba&x-signature-version=1.0&x-timestamp=2022-01-04T03:55:31Z"
   ```
3. Use the [MD5](https://en.wikipedia.org/wiki/MD5) to produce hash value for the Body parameters and convert to uppercase: `toUpper(MD5 (body))` to get **str2**:

   Body Parameter

   ```
   {"k1":123,"k2":"this is the api request body","k3":true,"k4":{"foo":[1,2]}}
   ```

   ```
   # str2  
   str2 = "E296C96787E1A309691CEF3692F5EEDD"
   ```
4. Join `path`, `&`, `str1`, `&`, `str2` in order to get **str3**:

   ```
   # str3  
   str3 = "/trade/place_order&a1=webull&a2=123&a3=xxx&host=api.webull.com&q1=yyy&x-app-key=776da210ab4a452795d74e726ebd74b6&x-signature-algorithm=HMAC-SHA1&x-signature-nonce=48ef5afed43d4d91ae514aaeafbc29ba&x-signature-version=1.0&x-timestamp=2022-01-04T03:55:31Z&E296C96787E1A309691CEF3692F5EEDD"
   ```
5. URL encode str3 to get **`encoded_string`**:

   ```
   # encoded_string  
   encoded_string = "%2Ftrade%2Fplace_order%26a1%3Dwebull%26a2%3D123%26a3%3Dxxx%26host%3Dapi.webull.com%26q1%3Dyyy%26x-app-key%3D776da210ab4a452795d74e726ebd74b6%26x-signature-algorithm%3DHMAC-SHA1%26x-signature-nonce%3D48ef5afed43d4d91ae514aaeafbc29ba%26x-signature-version%3D1.0%26x-timestamp%3D2022-01-04T03%3A55%3A31Z%26E296C96787E1A309691CEF3692F5EEDD"
   ```

### Step2: Constructing The Key[​](#step2-constructing-the-key "Direct link to Step2: Constructing The Key")

Append the character `&` to the end of your `App Secret` to get `app_secret`, e.g.:

```
# app_secret  
app_secret = "0f50a2e853334a9aae1a783bee120c1f&"
```

### Step 3: Generating the Signature Value[​](#step-3-generating-the-signature-value "Direct link to Step 3: Generating the Signature Value")

The algorithm for generating the signature value:

```
signature = base64(HMAC-SHA1(app_secret, encoded_string))
```

1. Use the `HMAC-SHA1` encryption algorithm, and encrypt the `encoded_string` with the key `app_secret`.
2. Then, encode the encrypted result using [Base64](https://en.wikipedia.org/wiki/Base64).
3. The final signature string is: **`kvlS6opdZDhEBo5jq40nHYXaLvM=`**.

## Additional Notes[​](#additional-notes "Direct link to Additional Notes")

info

1. If there are multiple parameters with the same name in the request, sort all values in ascending order, and then join them together using `&`. For example:

   ```
   url?name1=value1&name1=value2&name1=value3
   ```

   After sorting the values in ascending order and combining with `&`:

   ```
   name1 = value1&value2&value3
   ```
2. In Golang, the default for `json.Marshal` has `escapeHtml` set to `true`, which will escape `<`, `>`, and `&`. In this case, you need to replace the escaped content back to the original characters as shown below:

   ```
   func trans(data []byte) []byte {  
       data = bytes.Replace(data, []byte("\\u0026"), []byte("&"), -1)  
       data = bytes.Replace(data, []byte("\\u003c"), []byte("<"), -1)  
       data = bytes.Replace(data, []byte("\\u003e"), []byte(">"), -1)  
       return data  
   }
   ```

---

# URL: https://developer.webull.com/apis/docs/authentication/token

* Authentication
* Token

On this page

# Token

Clients may optionally enable Two-Factor Authentication (2FA). When 2FA is activated, an additional Token parameter (as part of the 2FA verification process) is required when connecting to the OpenAPI.
If 2FA is not enabled, this section may be ignored.

Note

If you are a user of the `Webull SDK`, the `Token` creation will be initiated automatically when you call the API.
You only need to complete the verification within the `Webull App`. For details, refer to [Enter Verification Code to Complete Verification](#token-verify);
if you are not using the `Webull SDK`, please refer to the [Token Creation Process](#token-create).

## Token Creation Process[​](#token-create "Direct link to Token Creation Process")

![token-flow.png](/apis/assets/images/token-flow-en-dfe94fa721ce3bb709be3addf6bc5d90.png)

### 1. Create Token[​](#1-create-token "Direct link to 1. Create Token")

Use the [Create Token API](/apis/docs/reference/create-token) to generate a `Token`. Upon successful creation, a `Token` with the status "Pending Verification" will be returned, and an SMS verification code will be sent to the phone number bound to your account.

At the same time, your program will loop to output logs, as follows:
![img.png](/apis/assets/images/2fa_loop-88d57900ba43a9069e0da77aef21c57d.png)

### 2. Enter the Verification Code to Complete Verification[​](#token-verify "Direct link to 2. Enter the Verification Code to Complete Verification")

Open the `Webull App`, enter the SMS verification code to complete the verification process. Upon successful verification, the Token status will change to "Active".

**Note:** Ensure your `Webull App` is updated to the latest version.

The verification code input window pops up automatically when the `Webull App` is running and push notifications are enabled. If it does not appear, you can go to Menu → Messages → OpenAPI Notifications, tap the latest verification message, and then enter the verification code to complete the verification. You can refer to the following steps

1. Firstly, you'll receive a notice from Open API; click the message to view details.
2. Then, click the Check Now button to begin verification
3. Enter the SMS verification code in the input box and click Confirm to complete the verification.

   ![Example banner](/apis/assets/images/token_message_first-267792d33b067f941c10358c9147bcd1.png)
   ![Example banner](/apis/assets/images/token_message-cd9658b08a80899c4b9c4dfdc3068efc.png)
   ![Example banner](/apis/assets/images/token_input-a9723bf32399d64de25a12255d477b93.png)

Note

If verification is not completed `within 5 minutes`, the "Check Token" interface will return a "Verification Timeout" error. In this case, you need to restart the application and initiate the verification process again.

### 3. Check Token Status[​](#3-check-token-status "Direct link to 3. Check Token Status")

Use the [Check Token API](/apis/docs/reference/check-token) to verify if the `Token` is valid. The `Token` statuses are as follows:

* **PENDING**: Token Pending Verification

  Description: A newly created Token is set to Pending Verification by default.
* **NORMAL**: Token Active

  Description: After a pending Token completes verification, its status will change to NORMAL.
* **INVALID**: Token Invalid

  Description: An active Token will be marked as Invalid if no API calls are made using it for 15 consecutive days. When a token does not exist in the system, it will be marked as invalid.
* **EXPIRED**: Token Expired

  Description: A pending Token will be marked as Expired if verification is not completed within 5 minutes.

Note

Tokens created in the Test Environment are valid by default. In the production environment, if you have enabled 2FA, you need to complete the 2FA verification to activate the token.

### 4. Store the Token (Optional)[​](#4-store-the-token-optional "Direct link to 4. Store the Token (Optional)")

A valid `Token` can be reused. To avoid generating a new `Token` each time you call the `OpenAPI`, we recommend storing the `Token` for future use.

### 5. Using the Token[​](#5-using-the-token "Direct link to 5. Using the Token")

After the `Token` is created and verified successfully, please add the `x-access-token` field to the request header and pass in a `Token` with the "Active" status to initiate the request. Below is a request example:

* Python

```
import http.client  
  
# PRD env host: api.webull.com;   
# Test env host: us-openapi-alb.uat.webullbroker.com  
conn = http.client.HTTPSConnection("<api_endpoint>")  
payload = ''  
headers = {  
  'Accept': 'application/json',  
  'x-app-key': '<your_app_key>',  
  'x-app-secret': '<your_app_secret>',  
  'x-timestamp': '2025-11-13T01:37:20Z',  
  'x-signature-version': '1.0',  
  'x-signature-algorithm': 'HMAC-SHA1',  
  'x-signature-nonce': '84537259051719556825112039',  
    
  # Add a field in the request header and pass in a "Token" with a valid status.  
  'x-access-token': '30434052718254686395872559',  
    
  'x-version': 'v2',  
  'x-signature': '68286690219370539858034209'  
}  
conn.request("GET", "/instrument/list?symbols=BULL&category=US_STOCK", payload, headers)  
res = conn.getresponse()  
data = res.read()  
print(data.decode("utf-8"))
```

---

# URL: https://developer.webull.com/apis/docs/broker-api/getting-started

* Broker API
* Getting Started

# Getting Started

The broker api is under construction. We will update here once it's available to the public.

---

# URL: https://developer.webull.com/apis/docs/changelog

On this page

# Change Logs

## 2026-03-14[​](#2026-03-14 "Direct link to 2026-03-14")

### API Reference[​](#api-reference "Direct link to API Reference")

**Market Data API**

* Added two new endpoints to the [event market module](/apis/docs/reference/event-market-data):
  + [Event Bars](/apis/docs/reference/event-bars)
  + [Event Tick](/apis/docs/reference/event-tick)

**Trading API**

* Added two new endpoints to the [Instrument module](/apis/docs/reference/instrument):

  + [Get Event Contract Categories](/apis/docs/reference/event-categories-list)
  + [Get Event Contract Events](/apis/docs/reference/event-events-list)
* Updated [Get Event Contract Series](/apis/docs/reference/event-series-list):

  + Request: Renamed parameter `last_instrument_id` to `last_series_id`; added `symbols` parameter.
  + Response: Renamed field `instrument_id` to `series_id`.
* Updated [Get Event Contract Instrument](/apis/docs/reference/event-market-list):

  + Request: Added `event_symbol`, `symbols`, and `expiration_date_after` parameters.
  + Response: Added `event_symbol` and `event_name` fields.

## 2026-03-07[​](#2026-03-07 "Direct link to 2026-03-07")

### API Reference[​](#api-reference-1 "Direct link to API Reference")

**Fractional Event Contract New Feature Support**

* [Trading Module](/apis/docs/reference/trading) : Now supports order placement for fractional event contracts
* [Get Event Contract Instrument Endpoint](/apis/docs/reference/event-market-list): Added dedicated fields for fractional event contract support and price range parameters of event contracts
  + `fractionable`: Boolean field indicating whether the **event contract** instrument supports fractional trading
  + `priceRanges`: Field defining the price range parameters for the **event contract** instrument

## 2026-01-31[​](#2026-01-31 "Direct link to 2026-01-31")

### Documentation[​](#documentation "Direct link to Documentation")

* Added [the Event Trading](/apis/docs/trade-api/event-contract) documentation to the Trading API module.

### API Reference[​](#api-reference-2 "Direct link to API Reference")

**Market Data API**

* Added two new interfaces, [Event Snapshot](/apis/docs/reference/event-snapshot) and [Event Depth](/apis/docs/reference/event-depth), to [the event market module](/apis/docs/reference/event-market-data).

**Trading API**

* Enhanced the interface capabilities of [the Trading module](/apis/docs/reference/trading), including support for event contracts and the addition of algorithmic order trading functionality (TWAP, VWAP, POV).

## 2026-01-17[​](#2026-01-17 "Direct link to 2026-01-17")

### Documentation[​](#documentation-1 "Direct link to Documentation")

* Added [About Connect API](/apis/docs/connect-api/about-connect-api) documentation under the Connect API module, providing an overview of the Connect API framework, its purpose, and core capabilities.
* Added [Authorization and Trading in Connect API](/apis/docs/connect-api/authentication) documentation under the Connect API module, detailing the end-to-end authorization flow and how trading operations are performed using Connect API.

### API Reference[​](#api-reference-3 "Direct link to API Reference")

**Market Data API**

* Added a new endpoint: [Footprint](/apis/docs/reference/footprint)
  **Connect API**
* Added [Get An Authorization Code](/apis/docs/reference/custom/get-authorization-code) API documentation, describing how to obtain an authorization code as part of the OAuth authorization process.
* Added [Create And Refresh Token](/apis/docs/reference/connect-api/create-and-refresh-token) API documentation, covering access token creation and token refresh mechanisms.

## 2026-01-12[​](#2026-01-12 "Direct link to 2026-01-12")

### API Reference Updates[​](#api-reference-updates "Direct link to API Reference Updates")

**Market Data API**

* **RESTful API**

  + Updated the response format for market data snapshots:
    For the latest response schema, see: [Snapshot](/apis/docs/reference/snapshot)
* **Data Streaming**

  + Enhanced the fields included in market data snapshot streaming.  
    For the latest payload definition, see: [Snapshot](/apis/docs/reference/snapshot)

**Trading API**

* **Orders**
  + Added a new endpoint: [Order Batch Place](/apis/docs/reference/order-batch-place)

## 2025-12-13[​](#2025-12-13 "Direct link to 2025-12-13")

### Now supporting futures and crypto trading![​](#now-supporting-futures-and-crypto-trading "Direct link to Now supporting futures and crypto trading!")

#### 1. Documentation[​](#1-documentation "Direct link to 1. Documentation")

* Added [futures](/apis/docs/trade-api/futures), [crypto](/apis/docs/trade-api/crypto) documents and code examples

#### 2. API Reference[​](#2-api-reference "Direct link to 2. API Reference")

* Description:

  + Market Data: Added futures and crypto market data interface. Supports market snapshot, historical bars, data etc.
  + Trading: Building on our existing trading APIs, we have launched a more powerful suite of trading interfaces (covering order estimate, place, replace, and cancel). Now, a single order place API enables trading across stocks, options, futures, and crypto.
  + Accounts & Assets: Now supporting futures and cryptocurrency accounts and assets.
* Interface:

  + [Market Data API](/apis/docs/reference/market-data):
    - Futures: [Tick](/apis/docs/reference/futures-market-data), [snapshot](/apis/docs/reference/futures-snapshot),[depth of book](/apis/docs/reference/futures-quotes),[historical bars](/apis/docs/reference/futures-historical-bars)
    - Crypto: [snapshot](/apis/docs/reference/crypto-snapshot),[historical bars](/apis/docs/reference/crypto-bars)
  + [Trading API](/apis/docs/reference/trading):
    - Accounts: [Account List](/apis/docs/reference/account-list)
    - Assets: [Account Balance](/apis/docs/reference/account-balance), [Account Positions](/apis/docs/reference/account-position)
    - Orders:
      * Futures: [Order Preview](/apis/docs/reference/common-order-preview), [Order Place](/apis/docs/reference/common-order-place), [Order Replace](/apis/docs/reference/common-order-replace), [Order Cancel](/apis/docs/reference/common-order-cancel)
      * Crypto: [Order Place](/apis/docs/reference/common-order-place), [Order Cancel](/apis/docs/reference/common-order-cancel)

## 2025-11-29[​](#2025-11-29 "Direct link to 2025-11-29")

### Documentation[​](#documentation-2 "Direct link to Documentation")

* Added code examples for the [**Assets**](/apis/docs/trade-api/asset#2-code-example), [**Accounts**](/apis/docs/trade-api/account#2-code-example), and [**Orders**](/apis/docs/trade-api/trade#3-code-example) modules in the documentation.
* Fixed broken links in the documentation.

## 2025-11-20[​](#2025-11-20 "Direct link to 2025-11-20")

### Documentation Initialization[​](#documentation-initialization "Direct link to Documentation Initialization")

#### Core Description[​](#core-description "Direct link to Core Description")

* Create the Webull official Open API documentation for the first time to provide developers with complete interface integration specifications, usage guides, and technical references.
* Document Purpose: For developers to integrate with Webull Open API and query interface details
* Document Structure: Divided into three core modules: "Documentation", "API Reference", and "Recipes"

#### Coverage[​](#coverage "Direct link to Coverage")

##### [1. Documentation](/apis/docs/)[​](#1-documentation-1 "Direct link to 1-documentation-1")

* Description: Welcome、About Webull、About Webull OpenAPI
* Development Tools: SDKs and Tools、Additional Resources
* Core Modules:
  + Authentication: Overview 、Individual Application Process、Signature、Token
  + Market Data API: Overview、Getting Started、Data API、Data Streaming API、FAQ
  + Trading API: Overview、Getting Started、Account API、Trading API、Trading Events、FAQ
  + Connect API: Under construction
  + Broker API: Under construction
* Supplementary Content: Q&A

##### [2. API Reference](/apis/docs/webull-open-api-reference)[​](#2-api-reference-1 "Direct link to 2-api-reference-1")

* Description: Webull Open API Reference
* [Authentication](/apis/docs/reference/authentication):
  + Document: [Token](/apis/docs/authentication/token)
  + interface: Create Token（POST）、Check Token（POST）
* [Market Data API](/apis/docs/reference/market-data):
  + Document: [Getting Started](/apis/docs/market-data-api/getting-started)
  + Stock:
    - Basic interface: Tick（GET）、Snapshot（GET）、Quotes（GET）、Historical Bars（POST）、Historical Bars (single symbol)（GET）
    - Streaming Interface: Subscribe（POST）、Unsubscribe（POST）
* [Trading API](/apis/docs/reference/custom/trading-api):
  + Document: [Getting Started](/apis/docs/trade-api/getting-started)
  + Utility interface: Instrument（GET）
  + Account interface: Account List（GET）、Account Balance（GET）、Account Positions（GET）
  + Order interface:
    - Stock order: Preview Order（POST）、Place Order（POST）、Replace Order（POST）、Cancel Order（POST）
    - Option order: Preview Options（POST）、Place Options（POST）、Modify Options（POST）、Cancel Options（POST）
    - Order Query: Order History（GET）、Open Order（GET）、Order Detail（GET）
  + Trade Events: Subscribe Trade Events

##### [3. Recipes](/apis/recipes_us)[​](#3-recipes "Direct link to 3-recipes")

* Signature Generation
* Create and verify token
* Place your first order

---

# URL: https://developer.webull.com/apis/docs/connect-api/about-connect-api

* Connect API
* About Connect API

On this page

# About Connect API

Webull Connect API provides a standardized set of APIs that enables third-party platforms to connect with a growing base of Webull brokerage accounts.

The Connect API uses OAuth 2.0 for authentication. OAuth 2.0 is a standardized and widely adopted authorization framework that allows third-party platforms to securely and seamlessly integrate with Webull’s OAuth endpoints.

For detailed instructions on how to connect your application to Webull using OAuth 2.0, please refer to the [OAuth Integration Guide](/apis/docs/connect-api/authentication).

**The Main Function:**
Supported instruments include U.S. stocks, futures, and crypto.

* **[Authorization](/apis/docs/reference/connect-api/connect)**: Authentication and authorization using the OAuth 2.0 protocol.
* **[Account](/apis/docs/reference/account)**: Query account info.
* **[Assets](/apis/docs/reference/assets)**: Query account balance, positions.
* **[Order](/apis/docs/reference/custom/order)**: Retrieve tradable securities, preview orders, and place, modify or cancel orders.

The `Connect API` and `Trading API` are identical in functionality across the account, assets, and orders modules.
The only difference lies in their base URLs.

For the base URL of the Connect API, please refer to the table below

| Environment | Type | url |
| --- | --- | --- |
| UAT | Authorization Login Redirect (H5) | passport.uat.webullbroker.com |
| Authorization, Account, Trading API | us-oauth-open-api.uat.webullbroker.com |
| PROD | Authorization Login Redirect (H5) | passport.webull.com |
| Authorization, Account, Trading API | us-oauth-open-api.webull.com |

### Contact us[​](#contact-us "Direct link to Contact us")

Having trouble? Contact us via the Webull API support email address:

* [api@webull-us.com](mailto:api@webull-us.com)
* [api-support@Webull-us.com](mailto:api-support@Webull-us.com)

---

# URL: https://developer.webull.com/apis/docs/connect-api/authentication

* Connect API
* OAuth Integration Guide

On this page

# OAuth Integration Guide

Webull API uses the OAuth 2.0 protocol for authentication. OAuth 2.0 is a straightforward protocol that third-party platforms can easily integrate with Webull's OAuth 2.0 endpoint.

### Authorization and Token Flow Overview[​](#authorization-and-token-flow-overview "Direct link to Authorization and Token Flow Overview")

The three actors in OAuth are:

| Role | Definition | Example |
| --- | --- | --- |
| Service provider | A service provider that uses OAuth 2.0 to let third-party platforms have limited access to a user's account | Webull |
| User | An individual user with an account at the service provider. | An individual user with an active account at Webull. |
| Third-party platform | Third-party platform application that accesses the service provider via OAuth 2.0 with the user's authorization. | Your application |

1. Register Your Application

   Register your application with Webull. After registration, initiate the authorization
   process by redirecting the user’s browser to the Webull authorization URL. Once the user
   completes authorization, parse the returned authorization code and exchange it for an
   access token, which is used to access Webull APIs.
2. Provide Application Information

   During registration, provide the following information:

   * Company name
   * Redirect URL (the callback endpoint to which Webull redirects the user after authorization)
3. Receive Application Credentials

   After successful registration, Webull will issue the following configuration parameters:

   * client\_id (Client ID)
   * client\_secret (Client Secret)
   * scope (authorization scope)
   * app\_key and app\_secret (used for request signing)

   Note

   The third-party platform must securely store the client\_secret and must not disclose it to any user or third party. If a compromise or potential exposure is detected, please contact us promptly to rotate and replace the credentials.
4. Obtain an Authorization Code

   Use the [Get An Authorization Code](/apis/docs/reference/connect-api/get-authorization-code) API to obtain an authorization code.
   If the user grants permission to your application, the callback URL registered in your application will be invoked. The interface for obtaining the authorization code is completed in the browser.

   * After the user authorizes access, Webull returns an authorization code.
   * The authorization code is short-lived and expires after 60 seconds.
   * The code can only be used to exchange for an access token.
5. Create an Access Token

   Use the [Create Access Token API](/apis/docs/reference/connect-api/create-and-refresh-token) to exchange the authorization code for an access token.

   * The access token is required for all subsequent API requests.
   * Access tokens expire every 30 minutes (exact expiration time is returned in the API response).
   * After expiration, a new access token must be obtained.
6. Refresh the Access Token

   Use the [Refresh Access Token API](/apis/docs/reference/connect-api/create-and-refresh-token) with a valid refresh token.

   * Upon refresh, a new refresh token and access token will be issued.
   * Refresh tokens expire after 15 days (exact expiration time is returned in the API response).

### API Calls[​](#api-calls "Direct link to API Calls")

For example, for the [Account List](/apis/docs/reference/account-list) API, the UAT environment is:

```
curl -X GET "https://us-oauth-open-api.uat.Webullbroker.com/oauth-openapi/account/list" \  
    -H 'Authorization: Bearer NTJhYjg5MTEtNmI5OS00NDYyLWE5Y2Et' \  
    -H 'accept: application/json' \
```

---

# URL: https://developer.webull.com/apis/docs/faq

* FAQ

On this page

# FAQ

### Q1: What is an API?[​](#q1-what-is-an-api "Direct link to Q1: What is an API?")

A: API stands for Application Programming Interface. Through an API, clients can connect their own systems with Webull's main system to perform actions such as quoting, querying, and automated order placement.

### Q2: Does Webull provide API services?[​](#q2-does-webull-provide-api-services "Direct link to Q2: Does Webull provide API services?")

A: Absolutely! The Webull API provides interface services for developers, allowing investors to fully leverage Webull API to connect their custom systems, making investment services much more efficient and tailored.

### Q3: What are the advantages of the Webull API?[​](#q3-what-are-the-advantages-of-the-webull-api "Direct link to Q3: What are the advantages of the Webull API?")

There are many advantages to using the Webull API, for example:

• Customized trading interfaces and features

You are not limited by a fixed trading screen. Users can develop their own exclusive trading interface to meet different trading needs.

• Automated order placement

By programming (such as using Python) and integrating with the API, full automation of computation and execution replaces manual trading, improving decision-making and trading efficiency and giving you an edge in milliseconds-sensitive markets.

### Q4: How long does API application approval take?[​](#q4-how-long-does-api-application-approval-take "Direct link to Q4: How long does API application approval take?")

A: API applications are expected to be reviewed as quickly as `1–2` business days.

### Q5: Can the market data I subscribed to in QT or the mobile app be used with OpenAPI?[​](#q5-can-the-market-data-i-subscribed-to-in-qt-or-the-mobile-app-be-used-with-openapi "Direct link to Q5: Can the market data I subscribed to in QT or the mobile app be used with OpenAPI?")

A: No. Subscriptions in QT or the mobile app are independent of OpenAPI. You need a separate data subscription specifically enabled for OpenAPI usage.

### Q6: Do we need to worry about identity signatures when using the Webull SDK?[​](#q6-do-we-need-to-worry-about-identity-signatures-when-using-the-webull-sdk "Direct link to Q6: Do we need to worry about identity signatures when using the Webull SDK?")

A: No. The Webull SDK has signature generation encapsulated, so you do not need to handle it separately.

### Q7: Why do I need an App Key and App Secret?[​](#q7-why-do-i-need-an-app-key-and-app-secret "Direct link to Q7: Why do I need an App Key and App Secret?")

A: The App Key and App Secret are application-level credentials assigned to developers. Only users with both an App Key and App Secret can make valid requests.

### Q8: Why set up an IP whitelist?[​](#q8-why-set-up-an-ip-whitelist "Direct link to Q8: Why set up an IP whitelist?")

A: An IP whitelist is a security mechanism set for institutional clients. Institutional clients can log in to the Webull Portal, go to the [API Application Management] module, and set multiple IP whitelist addresses. When accessing various Webull OpenAPI interfaces, this ensures client access security.

### Q9: How do I purchase market data permissions?[​](#q9-how-do-i-purchase-market-data-permissions "Direct link to Q9: How do I purchase market data permissions?")

A: please refer to [Subscribe Advanced Quotes](/apis/docs/market-data-api/subscribe-quotes).

### Q10: Why does the SDK enter a verification loop when starting up? The log shows the following information:[​](#q10-why-does-the-sdk-enter-a-verification-loop-when-starting-up-the-log-shows-the-following-information "Direct link to Q10: Why does the SDK enter a verification loop when starting up? The log shows the following information:")

```
fetch_token_from_server status not verified, check_token loop will start, waiting 5 seconds... (elapsed 131s / 300s)
```

A: This log indicates that when the `Webull SDK` starts for the first time, it attempts to retrieve a `token` from the server, but the current user has not yet been verified. As a result, the SDK automatically enters a polling check loop (check\_token loop), attempting to re-verify every 5 seconds, with a maximum duration of 300 seconds (5 minutes). If verification is not completed within 300 seconds, you need to restart the application to re-trigger the verification process.

Please refer to the [Token](/apis/docs/authentication/token#token-verify) page to complete the verification.

---

# URL: https://developer.webull.com/apis/docs/market-data-api/data-api

* Market Data API
* Data API

On this page

# Data API

The Data API provided by Webull allows developers to query market data via HTTP protocol. It is suitable for scenarios such as backtesting analysis and trading strategy support.  
For more details, please refer to the [API Reference](/apis/docs/reference/custom/market-data).

Before calling the Data API, you need to have an App Key and secret. For more information, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

## 1. Supported Data Types[​](#1-supported-data-types "Direct link to 1. Supported Data Types")

The Market Data API supports the following data types:

| Market | Data Category |
| --- | --- |
| United States | Stocks, ETFs, Futures, Cryptos, Event Contracts. |

## 2. Base URLs[​](#2-base-urls "Direct link to 2. Base URLs")

* **Production Environment**: `https://api.webull.com/`
* **Test Environment**: `http://us-openapi-alb.uat.webullbroker.com/`

---

# URL: https://developer.webull.com/apis/docs/market-data-api/data-streaming-api

* Market Data API
* Data Streaming API

On this page

# Data Streaming API



## Overview[​](#overview "Direct link to Overview")

The market data streaming API uses the [MQTT](https://mqtt.org/) protocol for data pushing with [Version 3.1.1](http://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html). The MQTT protocol requires an underlying transport that provides an ordered, lossless, stream of bytes from the client to server and server to client. Webull provides [TCP/IP](https://www.ietf.org/rfc/rfc793.txt) and [WebSocket](http://www.ietf.org/rfc/rfc5246.txt) transport protocols currently. By using this API, you can receive the most up to date market information via data streaming, that could help your trading strategy to act upon certain market movements.

**Supported markets and categories:**

| Market | Data Category |
| --- | --- |
| United States | Stocks, ETFs, Futures, Cryptos, Event Contracts. |

**Supported data types:**

| Data Type | Description |
| --- | --- |
| QUOTE | Real-time order book |
| SNAPSHOT | Market snapshot |
| TICK | Transaction details |

tip

If you wish to simplify the
process of obtaining real-time market data, you can utilize the SDK provided by Webull. Refer to the [SDK User Guide](/apis/docs/sdk) and the [Example for Retrieving Real-Time Quote Push](/apis/docs/market-data-api/getting-started#example-real-time-push).

## Steps to Use the Market Data Streaming API[​](#steps-to-use-the-market-data-streaming-api "Direct link to Steps to Use the Market Data Streaming API")

The following will introduce how to use the market data streaming API without using Webull SDK.

### Establish Connection[​](#establish-connection "Direct link to Establish Connection")

**MQTT Open Source Client Libraries:**

* [Python](https://github.com/eclipse/paho.mqtt.python)
* [Java](https://github.com/eclipse-paho/paho.mqtt.java)
* [Javascript](http://github.com/eclipse/paho.mqtt.javascript)
* [Golang](https://github.com/eclipse-paho/paho.mqtt.golang)
* [More programming languages](https://mqtt.org/software/)

**Connection Endpoint:**

* Production Environment

  ```
  // TCP/IP protocol:   
  data-api.webull.com:1883  
    
  // Websocket protocol:  
  wss://data-api.webull.com:8883/mqtt
  ```

Since MQTT protocol need a unique [Client Identifier(`ClientId`)](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html#_Toc385349242) for each connection, Please create a `session_id`
as the `ClientId` of MQTT CONNECT Packet, and it will also be used in subsequent [Market Data Streaming
Subscription/Unsubscription](/apis/docs/reference/market-data-streaming) operations.

caution

Please **DON'T** use the same `session_id` to
establish multiple connections under a single `App Key`. If you attempt to connect using same `session_id`, the
previous connection will be disconnected, and the new connection will replace the previous one.

If an `App Key` needs to establish multiple connections, please use different `session_id` for each connection. Also note that a single `App Key` can establish a maximum of 5 connections. If exceed, the server will return an error
code of `105` when attempting to establish a new connection.

After a connection is closed, the server will retain the connection state information for about 1 minute. If client
disconnect and immediately try to reconnect after having established 5 connections, the client may receive error code
of `105`. In this case, please wait for 1 minute before attempting to reconnect.

After a network connection is established by a client to the server, the first packet sent from the client to the
server should be a CONNECT packet. The CONNECT packet should contains these fields and values:

* **ClientId:** `session_id` created before
* **[User Name](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html#_Toc385349245):** Your `App Key`
* **[Password](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html#_Toc385349246):** Any value

If a well formed CONNECT packet is received by the server, but the server is unable to process it for some reason, then the server attempt to send a CONNACK packet containing the non-zero connect return code from this table:

| Return Code | Description |
| --- | --- |
| 0 | Connection accepted |
| 1 | Connection Refused, unacceptable protocol |
| 2 | Connection Refused, invalid `ClientId` |
| 3 | `App Key` is empty |
| 7 | Connection lost |
| 16 | Heartbeat timeout |
| 100 | Unknown error |
| 101 | Internal error |
| 102 | Connection already authenticated |
| 103 | Connection authentication failed |
| 104 | Invalid `App Key` |
| 105 | Exceeds connections limit |

### Subscription/Unsubscription[​](#subscriptionunsubscription "Direct link to Subscription/Unsubscription")

After successfully establishing an MQTT connection, client should use the **HTTP API** to subscribe to or unsubscribe the real-time market data. Only after a successful subscription will the server start pushing real-time market data to client.

* For the subscription HTTP API, please refer to the [Subscribe](/apis/docs/reference/subscribe)
* For the unsubscription HTTP API, please refer to the [Unsubscribe](/apis/docs/reference/unsubscribe)

caution

The connection between the client and server may be passively disconnected due to network issues. After reconnecting, previous market data subscriptions will **NOT** be automatically restored. Client need to use the subscription API
again in order to resume data streaming.

### Parse Messages[​](#parse-messages "Direct link to Parse Messages")

After a successful subscription request, the data callback method of the MQTT client will be triggered. The data packet pushed from server contains two parts:

* **Topic:** Identifies which type of the data is pushed.
* **Payload:** The real-time data that is being pushing.

The data of Payload was serialized using [Protocol Buffers](https://protobuf.dev/) protocol or [JSON](https://datatracker.ietf.org/doc/html/rfc8259) format. Please parse the Payload based on the Topic.

The Payload corresponding to the Topic is as follows:

| Data type | Topic | Protocol | Description |
| --- | --- | --- | --- |
| QUOTE | quote | [Real-time Order Book Proto](#real-time-order-book-proto) | [Real-time Order Book](/apis/docs/reference/quotes) |
| QUOTE | event-quote | [Event Real-time Order Book Proto](#event-quote-proto) | [Event Real-time Order Book](/apis/docs/reference/event-depth) |
| SNAPSHOT | snapshot | [Quote Snapshot Proto](#snapshot-proto) | [Quote Snapshot](/apis/docs/reference/snapshot) |
| SNAPSHOT | event-snapshot | [Event Quote Snapshot Proto](#event-snapshot-proto) | [Quote Snapshot](/apis/docs/reference/event-snapshot) |
| TICK | tick | [Tick-by-Tick Detail Proto](#tick-by-tick-proto) | [Tick-by-Tick Detail](/apis/docs/reference/tick) |
| NOTICE | notice | [Notification JSON](#notification-json) | Notification data sent from server to client, used for the server to send notifications to the client |
| ECHO | echo | Null Packet | Null Packet sent from server to client, used to verify if the client is online |

#### Payload data format definition[​](#payload-data-format-definition "Direct link to Payload data format definition")

##### Basic Proto[​](#basic-proto "Direct link to Basic Proto")

```
message Basic {  
    string symbol = 1;  
    string instrument_id = 2;  
    string timestamp = 3;  
}
```

##### Real-time Order Book Proto[​](#real-time-order-book-proto "Direct link to Real-time Order Book Proto")

```
message Quote {  
    Basic basic = 1;  
    repeated AskBid asks = 2;  
    repeated AskBid bids = 3;  
}  
  
message AskBid {  
    string price = 1;  
    string size = 2;  
    repeated Order order = 3;  
    repeated Broker broker = 4;  
}  
  
message Order {  
    string mpid = 1;  
    string size = 2;  
}  
  
message Broker {  
    string bid = 1;  
    string name = 2;  
}
```

##### Market Snapshot Proto[​](#snapshot-proto "Direct link to Market Snapshot Proto")

```
message Snapshot {  
    Basic basic = 1;  
    string trade_time = 2;  
    string price = 3;  
    string open = 4;  
    string high = 5;  
    string low = 6;  
    string pre_close = 7;  
    string volume = 8;  
    string change = 9;  
    string change_ratio = 10;  
  
    string ext_trade_time = 11;  
    string ext_price = 12;  
    string ext_high = 13;  
    string ext_low = 14;  
    string ext_volume = 15;  
    string ext_change = 16;  
    string ext_change_ratio = 17;  
  
    string ovn_trade_time = 18;  
    string ovn_price = 19;  
    string ovn_high = 20;  
    string ovn_low = 21;  
    string ovn_volume = 22;  
    string ovn_change = 23;  
    string ovn_change_ratio = 24;  
}
```

##### Tick-by-Tick Detail Proto[​](#tick-by-tick-proto "Direct link to Tick-by-Tick Detail Proto")

```
message Tick {  
    Basic basic = 1;  
    string time = 2;  
    string price = 3;  
    string volume = 4;  
    string side = 5;  
}
```

##### Event Quote Proto[​](#event-quote-proto "Direct link to Event Quote Proto")

```
message EventQuote {  
    Basic basic = 1;  
    repeated EventAskBid yes_bids = 2;  
    repeated EventAskBid no_bids = 3;  
}  
  
message EventAskBid {  
    string price = 1;  
    string size = 2;  
}
```

##### Event Snapshot Proto[​](#event-snapshot-proto "Direct link to Event Snapshot Proto")

```
message EventSnapshot {  
    Basic basic = 1;  
    string price = 2;  
    string volume = 3;  
    string last_trade_time = 4;  
    string open_interest = 5;  
    string yes_ask = 6;  
    string yes_bid = 7;  
    string yes_ask_size = 8;  
    string yes_bid_size = 9;  
    string no_ask = 10;  
    string no_bid = 11;  
    string no_ask_size = 12;  
    string no_bid_size = 13;  
}
```

##### Notification JSON[​](#notification-json "Direct link to Notification JSON")

```
// Status Notification  
{  
  "type": "status",      // Notification type  
  "rtt": 100,            // RTT to server  
  "drop": 0,             // Number of packets dropped by server  
  "sent": 0,             // Number of packets sent by server  
}
```

---

# URL: https://developer.webull.com/apis/docs/market-data-api/faq

* Market Data API
* FAQ

On this page

# FAQ

### 1. Why am I receiving an HTTP 403 error (Forbidden)?[​](#1-why-am-i-receiving-an-http-403-error-forbidden "Direct link to 1. Why am I receiving an HTTP 403 error (Forbidden)?")

A 403 error is returned by the market data API when any of the following conditions are met:

* The request does not include authentication information
* The authentication credentials are invalid
* The user does not have sufficient permissions

For more details, please refer to:  
User Authentication and Authorization Process [Authentication](/apis/docs/authentication/overview).

### 2: Do we need to handle signatures when using the Webull SDK?[​](#2-do-we-need-to-handle-signatures-when-using-the-webull-sdk "Direct link to 2: Do we need to handle signatures when using the Webull SDK?")

A: No, the Webull SDK has already encapsulated signature generation within the SDK, so you do not need to worry about it.

### 3: Why do we need to add an App Key and App Secret?[​](#3-why-do-we-need-to-add-an-app-key-and-app-secret "Direct link to 3: Why do we need to add an App Key and App Secret?")

A: The App Key and App Secret are application-level identity credentials assigned to developers. Only users with an App Key and App Secret can interact with the API properly.

### 4: How do I purchase market data permissions?[​](#4-how-do-i-purchase-market-data-permissions "Direct link to 4: How do I purchase market data permissions?")

A: please refer to [Subscribe Advanced Quotes](/apis/docs/market-data-api/subscribe-quotes).

---

# URL: https://developer.webull.com/apis/docs/market-data-api/getting-started

* Market Data API
* Getting Started

On this page

# Getting Started



This is a quick guide to help you access market data via API. The guide covers the following topics: installing the Webull SDK, obtaining API keys, and how to request historical and real-time market data.

## 1. Install the Webull Client SDK[​](#1-install-the-webull-client-sdk "Direct link to 1. Install the Webull Client SDK")

### Requirements[​](#requirements "Direct link to Requirements")

* Python

[Python](https://www.python.org/) version 3.8 through 3.11 is required.

### SDK Installation[​](#sdk-installation "Direct link to SDK Installation")

* Python

Install via pip

```
pip3 install --upgrade webull-openapi-python-sdk
```

## 2. Generate API Keys and Authenticate[​](#2-generate-api-keys-and-authenticate "Direct link to 2. Generate API Keys and Authenticate")

Each API call requires authentication based on the `App Key` and a signature generated using the `App Secret`.
The client must include the `App Key` and the signature value in the HTTP request headers named `x-app-key` and `x-signature`, respectively.

For information on how to obtain the `App Key` and `App Secret`, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

## 3. Request Market Data via SDK[​](#3-request-market-data-via-sdk "Direct link to 3. Request Market Data via SDK")

After installing the SDK and obtaining your API keys, you can use the Market Data API. The following example
demonstrates how to request candlestick bars data. For other types of data, please refer to the [Market Data API
Reference Documentation](/apis/docs/reference/market-data).

### Requesting Historical Data: Example with candlestick bars Data[​](#requesting-historical-data-example-with-candlestick-bars-data "Direct link to Requesting Historical Data: Example with candlestick bars Data")

* Python

```
from webull.data.common.category import Category  
from webull.data.common.timespan import Timespan  
from webull.core.client import ApiClient  
from webull.data.data_client import DataClient  
  
# PRD env host: api.webull.com;   
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "<api_endpoint>"   
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
if __name__ == '__main__':  
    data_client = DataClient(api_client)  
  
    res = data_client.market_data.get_history_bar('AAPL', Category.US_STOCK.name, Timespan.M1.name)  
    if res.status_code == 200:  
        print('get_history_bar:', res.json())  
          
    res = data_client.market_data.get_batch_history_bar(['AAPL', 'TSLA'], Category.US_STOCK.name, Timespan.M1.name, 1)  
    if res.status_code == 200:  
        print('get_batch_history_bar:', res.json())
```

The following example demonstrates how to use the SDK to retrieve real-time quote data push. If you prefer not to
use the SDK, please refer to the [Data Streaming API](/apis/docs/market-data-api/data-streaming-api)。

### Example for Retrieving Real-Time Quote Push[​](#example-real-time-push "Direct link to Example for Retrieving Real-Time Quote Push")

* Python

```
from webull.data.common.category import Category  
from webull.data.common.subscribe_type import SubscribeType  
from webull.data.data_streaming_client import DataStreamingClient  
  
  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
  
# PRD env host: api.webull.com;   
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "<api_endpoint>"  
optional_quotes_endpoint = "<data_api_endpoint>"  
region_id = "us"  
  
session_id = "demo_session_1"  
data_streaming_client = DataStreamingClient(your_app_key, your_app_secret, region_id, session_id,  
                                    http_host=optional_api_endpoint,  
                                    mqtt_host=optional_quotes_endpoint)  
  
if __name__ == '__main__':  
    def my_connect_success_func(client, api_client,session_id):  
        print("connect success with session_id:%s" % client.get_session_id())  
  
        symbols = ['AAPL']  
        sub_types = [SubscribeType.QUOTE.name, SubscribeType.SNAPSHOT.name, SubscribeType.TICK.name]  
        client.subscribe(symbols, Category.US_STOCK.name, sub_types)  
  
  
    def my_quotes_message_func(client, topic, quotes):  
        print("receive message: topic:%s, quotes:%s" % (topic, quotes))  
  
  
    def my_subscribe_success_func(client, api_client,session_id):  
        print("subscribe success with session_id:%s" % client.get_session_id())  
  
  
    # set connect success callback func  
    data_streaming_client.on_connect_success = my_connect_success_func  
    # set quotes receiving callback func  
    data_streaming_client.on_quotes_message = my_quotes_message_func  
    # set subscribe success callback func  
    data_streaming_client.on_subscribe_success = my_subscribe_success_func  
    # the sync mode, blocking in current thread  
    data_streaming_client.connect_and_loop_forever()
```

---

# URL: https://developer.webull.com/apis/docs/market-data-api/overview

* Market Data API
* Overview

On this page

# Overview

The Market Data API provides access to market data via both HTTP and WebSocket/TCP protocols. Our focus is on historical and real-time data, enabling developers to efficiently integrate these APIs into their applications.

The Market Data API is divided into the [Data API](/apis/docs/market-data-api/data-api) and the [Data Streaming API](/apis/docs/market-data-api/data-streaming-api). The Data API uses
the
HTTP protocol
and is mainly for developers to pull historical and latest market data. The Data Streaming API uses MQTT protocol based on WebSocket/TCP for pushing real-time market data.

To simplify integration, we provide SDKs in Python. These SDKs offer comprehensive encapsulation of authentication
interfaces, allowing developers to get started quickly. For details on how to install the SDK, please refer to the
[SDKs and Tools](/apis/docs/sdk).

## Market API Overview[​](#market-api-overview "Direct link to Market API Overview")

| Type | Function | Protocol | Description | Threshold |
| --- | --- | --- | --- | --- |
| [Stock Quotes](/apis/docs/reference/custom/quotes-stock) | [Tick](/apis/docs/reference/tick) | HTTP | Interface for retrieving tick-by-tick transaction data of securities. Returns detailed tick-by-tick transaction records for specified securities within a specified time range | 300/60s |
| [Snapshot](/apis/docs/reference/snapshot) | HTTP | Real-time market snapshot data interface for securities, supporting queries for multiple security types such as US stocks, Hong Kong stocks, etc. |
| [Quotes](/apis/docs/reference/quotes) | HTTP | Interface for retrieving the latest order book data of securities. Returns order book information at specified depth, including price, quantity, order details, etc. |
| [Historical Bars (single symbol)](/apis/docs/reference/bars) | HTTP | Supports historical candlestick bars data at various granularities such as `M1`, `M5`, etc.; currently, daily candlestick bars and above only provide forward-adjusted candlestick bars data, while minute candlestick bars data only provides non-adjusted candlestick bars data |
| [Historical Bars](/apis/docs/reference/historical-bars) | HTTP | candlestick bars batch query supports historical candlestick bars data at various granularities such as `M1`, `M5`, etc.; currently, daily candlestick bars and above only provide forward-adjusted candlestick bars data, while minute candlestick bars data only provides non-adjusted candlestick bars data |
| [Futures Quotes](/apis/docs/reference/futures-market-data) | [Tick](/apis/docs/reference/futures-tick) | HTTP | Returns time, price, volume, and direction of individual trades for a futures contract within a specified time range, sorted latest-first |
| [Snapshot](/apis/docs/reference/futures-snapshot) | HTTP | Returns real-time key indicators (e.g., latest price, change, volume, turnover rate) for a futures contract |
| [Quotes](/apis/docs/reference/futures-quotes) | HTTP | Fetch the latest bid/ask data for a futures contract at a specified depth, including price and quantity |
| [Historical Bars](/apis/docs/reference/futures-historical-bars) | HTTP | Batch query for recent N bars of futures data by symbol, granularity (e.g., M1, M5), and type. |
| [Crypto Quotes](/apis/docs/reference/crypto-market-data) | [Snapshot](/apis/docs/reference/crypto-snapshot) | HTTP | Fetch real-time market snapshots for up to 20 crypto symbols, including latest price, change, % change, bid/ask quotes, and other key metrics |
| [Historical Bars](/apis/docs/reference/crypto-bars) | HTTP | Fetch historical candlestick data for a crypto symbol across intervals (M1, M5, H1, D, etc.). Daily+ bars are forward-adjusted; minute bars are unadjusted. Returns 1–1200 most recent bars |
| [Streaming](/apis/docs/reference/market-data-streaming) | [Subscribe](/apis/docs/reference/subscribe) | HTTP | Market data subscription interface. After the market data push MQTT connection is successfully established, call this interface to subscribe to real-time market data push notifications | / |
| [Unsubscribe](/apis/docs/reference/unsubscribe) | HTTP | Unsubscribe interface. After the market data push MQTT connection is successfully established, call this interface to unsubscribe from real-time market data push notifications |

## Usage Fees[​](#usage-fees "Direct link to Usage Fees")

**Market Data:**

| Market | Category | Permission Acquisition |
| --- | --- | --- |
| US Market | Securities Products (Stocks, ETFs, Night Session) | To obtain permission to access U.S. stock market data, please purchase Level 1 and Level 2 market data for U.S. stock.  Note:Subscriptions in QT or the mobile app are independent of OpenAPI. You need a separate data subscription specifically enabled for OpenAPI usage. Only one device may access LV1 and LV2 at any one time. |
| US Market | Futures | Not supported yet. Coming soon. |
| US Market | Crypto |  |

---

# URL: https://developer.webull.com/apis/docs/market-data-api/subscribe-quotes

* Market Data API
* Subscribe Advanced Quotes

On this page

# Subscribe Advanced Quotes

We provide the OpenAPI Advanced Market Data Subscription Service, which supports tick-by-tick trades, order book depth, order queues, time-and-sales details, and other advanced market data.

Before you begin, please ensure that you have reviewed our Getting Started guide and obtained a valid  
`App Key` and `Secret Key`.

If you do not yet have a valid `App Key` and `Secret Key`, you may follow the instructions below to obtain them.

* For individual users, please see: [here](/apis/docs/authentication/IndividualApplicationAPI).

note

Please note that advanced quotes subscriptions purchased through `QT` or the `mobile app` are not applicable to the `OpenAPI`. You will need to subscribe to advanced market data separately for `OpenAPI` use.

## Subscribe Advanced Quotes[​](#subscribe-advanced-quotes-1 "Direct link to Subscribe Advanced Quotes")

1. Open and log in [Webull Technology official website](https://www.webullapp.com/quote).
   ![img.png](/apis/assets/images/advanced_quotes1-e94032b511db15a9012081e3b38ee173.png)
2. Click [Advanced Quotes] from the avatar menu in the upper-right corner to navigate to the Advanced Quotes Center.
   ![img.png](/apis/assets/images/advanced_quotes2-d31330be567f75e7c0ec5d7d4dc0a2d4.png)
3. In the Advanced Quotes Center, select OpenAPI Advanced Quotes to view and subscribe to the corresponding data services.
   ![img.png](/apis/assets/images/advanced_quotes3-e62524d4944b0fb618efee3952b4bc21.png)

---

# URL: https://developer.webull.com/apis/docs/reference/account

* [Trading API](/apis/docs/reference/custom/trading-api)
* Account

# Account

Account management interface

[## 📄️ Account List

• Function description: Query the account list and return account information.<br/>• Frequency limit: Rate limit 10 requests every 30 seconds](/apis/docs/reference/account-list)

---

# URL: https://developer.webull.com/apis/docs/reference/account-balance

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Assets](/apis/docs/reference/assets)
* Account Balance

# Account Balance

```
GET

## /openapi/assets/balance
```

• Function description: Query account details by account ID.  
• Frequency limit: Rate limit 2 requests every 2 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/account-list

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Account](/apis/docs/reference/account)
* Account List

# Account List

```
GET

## /openapi/account/list
```

• Function description: Query the account list and return account information.  
• Frequency limit: Rate limit 10 requests every 30 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/account-position

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Assets](/apis/docs/reference/assets)
* Account Positions

# Account Positions

```
GET

## /openapi/assets/positions
```

• Function description: Query positions according to the account ID.  
• Frequency limit: Rate limit 2 requests every 2 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/assets

* [Trading API](/apis/docs/reference/custom/trading-api)
* Assets

# Assets

Assets management interface

[## 📄️ Account Balance

• Function description: Query account details by account ID.<br/>• Frequency limit: Rate limit 2 requests every 2 seconds](/apis/docs/reference/account-balance)

[## 📄️ Account Positions

• Function description: Query positions according to the account ID.<br/>• Frequency limit: Rate limit 2 requests every 2 seconds](/apis/docs/reference/account-position)

---

# URL: https://developer.webull.com/apis/docs/reference/authentication

* Authentication

# Authentication

Authentication related interfaces, providing Token creation, validation, and refresh functionality. A Token is a necessary credential for accessing other API interfaces, used to verify user identity and permissions.

[## 📄️ Create Token

• Function description: Create an access token.This interface is used to generate a new Token, which is the credential for accessing other API interfaces. Upon successful creation, it returns a response containing Token information, expiration time, and status. The Token status defaults to 'Pending Verification' and requires verification via Webull App SMS code. Tokens are time-sensitive (default 15 days) and need to be refreshed before expiration.<br/>• Frequency limit: Rate limit 10 requests every 30 seconds](/apis/docs/reference/create-token)

[## 📄️ Check Token

• Function description: Query Token Status.This API is used to check the validity of a given token. If the status is NORMAL, the token is active and can be used normally. If the status is PENDING, the token is pending verification and requires a mobile verification code via the Webull App. If the status is INVALID, the token is invalid and must be regenerated. If the status is EXPIRED, the token has expired and must be regenerated.<br/>• Frequency limit: Rate limit 10 requests every 30 seconds](/apis/docs/reference/check-token)

---

# URL: https://developer.webull.com/apis/docs/reference/bars

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Stock](/apis/docs/reference/stock-market-data)
* Historical Bars (single symbol)

# Historical Bars (single symbol)

```
GET

## /openapi/market-data/stock/bars
```

• Function description: Query the recent N bars of data based on stock symbol, time granularity, and type. Supports historical bars of various granularities like M1, M5, etc. Currently, daily bars (D) and above only provide forward-adjusted bars; minute bars provide unadjusted bars.  
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/cancel-order

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Stock](/apis/docs/reference/stock)
* Cancel Order

# Cancel Order

```
POST

## /openapi/trade/stock/order/cancel
```

• Function description: Cancel the equity order according to the incoming client\_order\_id. Only supports EQUITY.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/check-token

* [Authentication](/apis/docs/reference/authentication)
* Check Token

# Check Token

```
POST

## /openapi/auth/token/check
```

• Function description: Query Token Status.This API is used to check the validity of a given token. If the status is NORMAL, the token is active and can be used normally. If the status is PENDING, the token is pending verification and requires a mobile verification code via the Webull App. If the status is INVALID, the token is invalid and must be regenerated. If the status is EXPIRED, the token has expired and must be regenerated.  
• Frequency limit: Rate limit 10 requests every 30 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/common-order-cancel

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Trading(recommended)](/apis/docs/reference/trading)
* Order Cancel

# Order Cancel

```
POST

## /openapi/trade/order/cancel
```

• Function description: Cancel orders for equities, options, futures and cryptos according to the incoming account\_id and client\_order\_id.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/common-order-place

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Trading(recommended)](/apis/docs/reference/trading)
* Order Place

# Order Place

```
POST

## /openapi/trade/order/place
```

• Function description: Place equity orders (preferred), including simple orders.  
For futures, only quantity orders are supported.  
Please note: When selling crypto, your position must not fall below $2 after placing the order.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/common-order-preview

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Trading(recommended)](/apis/docs/reference/trading)
* Order Preview

# Order Preview

```
POST

## /openapi/trade/order/preview
```

• Function description: Calculate the estimated amount and cost based on the incoming information, and support simple orders. For crypto trading, this feature is currently not supported.  
• Frequency limit: Rate limit 150 requests every 10 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/common-order-replace

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Trading(recommended)](/apis/docs/reference/trading)
* Order Replace

# Order Replace

```
POST

## /openapi/trade/order/replace
```

• Function description: Modify equity, options and futures orders, including simple orders. For crypto trading, this feature is currently not supported.  
• Futures order modification rules:  
  - For market orders, only `quantity` can be modified.  
  - For limit orders, only `order_type`, `time_in_force`, `quantity` and `limit_price` can be modified; if modifying `order_type`, it can only be changed to `market`.  
  - For stop orders, only `order_type`, `time_in_force`, `quantity` and `stop_price` can be modified; if modifying `order_type`, it can only be changed to `market`.  
  - For stop limit orders, only `order_type`, `time_in_force`, `quantity`, `limit_price` and `stop_price` can be modified; if modifying `order_type`, it can only be changed to `limit`.  
  - For trailing stop orders, only `trailing_stop_step` can be modified; `order_type` , `trailing_type` and `time_in_force` cannot be modified.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/connect-api/connect

* Connect API

# Connect

Connect Authorization

[## 📄️ Get An Authorization Code

This is the first step of the OAuth2 process. An authorization code is created when the user authorizes your application to access their account. If the user grants permission to your application, the callback URL registered in your application will be invoked. The interface for obtaining the authorization code is completed in the browser.<br/> <b>'SEND API REQUEST' function for this endpoint does not work in UAT environment</b>.](/apis/docs/reference/connect-api/get-authorization-code)

[## 📄️ Create And Refresh Token

This is the second step of the OAuth process. An access token is created using the authorization code from the first step's response. The access token is a key used for API access. These tokens should be protected like passwords.](/apis/docs/reference/connect-api/create-and-refresh-token)

---

# URL: https://developer.webull.com/apis/docs/reference/connect-api/create-and-refresh-token

* [Connect API](/apis/docs/reference/connect-api/connect)
* Create And Refresh Token

# Create And Refresh Token

```
POST

## /openapi/oauth2/token
```

This is the second step of the OAuth process. An access token is created using the authorization code from the first step's response. The access token is a key used for API access. These tokens should be protected like passwords.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/connect-api/get-authorization-code

* [Connect API](/apis/docs/reference/connect-api/connect)
* Get An Authorization Code

# Get An Authorization Code

```
GET

## /oauth2/authenticate/login
```

This is the first step of the OAuth2 process. An authorization code is created when the user authorizes your application to access their account. If the user grants permission to your application, the callback URL registered in your application will be invoked. The interface for obtaining the authorization code is completed in the browser.  
 **'SEND API REQUEST' function for this endpoint does not work in UAT environment**.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 302

After successful authorization, it will call back to the redirect\_uri in the request parameters, structured as follows:  
 <http://testcallbackurl.com?code=NjVhODIxODItYTAzMC00Y2IxLTkzNzQt&state=MiLCJjb25uZWN0aW9uX3R5cGUiOiJs>

---

# URL: https://developer.webull.com/apis/docs/reference/create-token

* [Authentication](/apis/docs/reference/authentication)
* Create Token

# Create Token

```
POST

## /openapi/auth/token/create
```

• Function description: Create an access token.This interface is used to generate a new Token, which is the credential for accessing other API interfaces. Upon successful creation, it returns a response containing Token information, expiration time, and status. The Token status defaults to 'Pending Verification' and requires verification via Webull App SMS code. Tokens are time-sensitive (default 15 days) and need to be refreshed before expiration.  
• Frequency limit: Rate limit 10 requests every 30 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/crypto-bars

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Crypto](/apis/docs/reference/crypto-market-data)
* Historical Bars

# Historical Bars

```
GET

## /openapi/market-data/crypto/bars
```

Retrieve historical candlestick (K-line) data for a specified crypto symbol.  
  
Supports multiple time intervals such as M1, M5, H1, D, etc.  
• Daily and higher intervals return forward-adjusted bars  
• Minute intervals return non-adjusted bars  
  
Supports retrieving the most recent N bars:  
• Range: 1–1200 bars (all intervals)  
  
**Rate Limits:**  
• 1 request per second per App Key  
• Market Data Global Limit: 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

List of historical bar (candlestick) records.

---

# URL: https://developer.webull.com/apis/docs/reference/crypto-instrument-list

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Crypto Instrument

# Get Crypto Instrument

```
GET

## /openapi/instrument/crypto/list
```

• Function description: Get profile information for one or more instruments.  
• Frequency limit: Rate limit 60 requests every 60 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/crypto-market-data

* [Market Data API](/apis/docs/reference/custom/market-data)
* Crypto

# Crypto Market Data

Real-time and historical market data interfaces for crypto assets.

[## 📄️ Snapshot

Retrieve real-time market snapshot data for one or more crypto symbols.<br/><br/>The response includes key market indicators such as latest price, price change, price change percentage, bid/ask quotes, and other real-time metrics.<br/>Supports querying up to <b>20 symbols</b> per request.<br/><br/><b>Rate Limits:</b><br/>• 1 request per second per App Key<br/>• Market Data Global Limit: 600 requests per minute](/apis/docs/reference/crypto-snapshot)

[## 📄️ Historical Bars

Retrieve historical candlestick (K-line) data for a specified crypto symbol.<br/><br/>Supports multiple time intervals such as M1, M5, H1, D, etc.<br/>• Daily and higher intervals return forward-adjusted bars<br/>• Minute intervals return non-adjusted bars<br/><br/>Supports retrieving the most recent N bars:<br/>• Range: 1–1200 bars (all intervals)<br/><br/><b>Rate Limits:</b><br/>• 1 request per second per App Key<br/>• Market Data Global Limit: 600 requests per minute](/apis/docs/reference/crypto-bars)

---

# URL: https://developer.webull.com/apis/docs/reference/crypto-snapshot

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Crypto](/apis/docs/reference/crypto-market-data)
* Snapshot

# Snapshot

```
GET

## /openapi/market-data/crypto/snapshot
```

Retrieve real-time market snapshot data for one or more crypto symbols.  
  
The response includes key market indicators such as latest price, price change, price change percentage, bid/ask quotes, and other real-time metrics.  
Supports querying up to **20 symbols** per request.  
  
**Rate Limits:**  
• 1 request per second per App Key  
• Market Data Global Limit: 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/custom/events

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* Trade Events

# Trade Events

Trade Events Management

[## 📄️ Subscribe Trade Events

Interface Description](/apis/docs/reference/custom/subscribe-trade-events)

[## 📄️ Subscribe Position Events

Interface Description](/apis/docs/reference/custom/subscribe-position-events)

---

# URL: https://developer.webull.com/apis/docs/reference/custom/get-authorization-code

On this page

# Get An Authorization Code

### Redirect Link Description[​](#redirect-link-description "Direct link to Redirect Link Description")

* Function description:

  This is the first step of the OAuth process. An authorization code is created when the user authorizes your application to access their account. If the user grants permission to your application, the callback URL registered in your application will be invoked. The interface for obtaining the authorization code is completed in the browser.
* Request Method:Browser requests the redirect link
* Request URL:/oauth2/authenticate/login

### Parameters[​](#parameters "Direct link to Parameters")

| Parameter | Type | Required | Description | Values/Example |
| --- | --- | --- | --- | --- |
| response\_type | String | Required | Authorization type : code | code |
| client\_id | String | Required | ClientID | CLINETTEST |
| scope | String | Required | Authorization scope   user：user   trade：trade   wr：write read | user:trade:wr |
| state | String | Optional | Unique String  Returned during the callback, used for tampering verification. | MiLCJjb25uZWN0aW9uX3R5cGUiOiJs |
| redirect\_uri | String | Required | The callback URL registered by your application during the application process will be called after the user successfully authorizes. | `http://testcallbackurl.com` |

### Response[​](#response "Direct link to Response")

| Parameter | Type | Required | Description | Values/Example |
| --- | --- | --- | --- | --- |
| code | String | Required | Authorization code | MDM2T0IyUFNRNDk4UzBLSEtCVDgwMDAwMDA= |
| state | String | Optional | Unique string during the request.   This is returned for tampering verification; if it is provided during the request, it will also be returned in the response. | MiLCJjb25uZWN0aW9uX3R5cGUiOiJs |

### Code Example[​](#code-example "Direct link to Code Example")

Open the authorization page in the browser (using the UAT environment as an example):

`https://passport.uat.webullbroker.com/oauth2/authenticate/login?response_type=code&client_id=CLINETTEST&scope=user:trade:wr&redirect_uri=http://testcallbackurl.com&state=MiLCJjb25uZWN0aW9uX3R5cGUiOiJs`

### Response[​](#response-1 "Direct link to Response")

After successful authorization, it will call back to the redirect\_uri in the request parameters, structured as follows:

`http://testcallbackurl.com?code=MDM2T0IyUFNRNDk4UzBLSEtCVDgwMDAwMDA=&state=MiLCJjb25uZWN0aW9uX3R5cGUiOiJs`

---

# URL: https://developer.webull.com/apis/docs/reference/custom/market-data

* Market Data API

# Market Data API

Market Data Interfaces

[## 🗃️ Stock

6 items](/apis/docs/reference/stock-market-data)

[## 🗃️ Futures

5 items](/apis/docs/reference/futures-market-data)

[## 🗃️ Crypto

2 items](/apis/docs/reference/crypto-market-data)

[## 🗃️ Event

4 items](/apis/docs/reference/event-market-data)

[## 🗃️ Streaming

2 items](/apis/docs/reference/market-data-streaming)

---

# URL: https://developer.webull.com/apis/docs/reference/custom/order

* [Trading API](/apis/docs/reference/custom/trading-api)
* Order

# Order

Order Management Interfaces

[## 🗃️ Trading(recommended)

5 items](/apis/docs/reference/trading)

[## 🗃️ Stock

4 items](/apis/docs/reference/stock)

[## 🗃️ Option

4 items](/apis/docs/reference/option)

[## 🗃️ Order Query

3 items](/apis/docs/reference/order-query)

[## 🗃️ Trade Events

2 items](/apis/docs/reference/custom/events)

---

# URL: https://developer.webull.com/apis/docs/reference/custom/subscribe-position-events

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Trade Events](/apis/docs/reference/custom/events)
* Subscribe Position Events

On this page

# Subscribe Position Events

### Interface Description[​](#interface-description "Direct link to Interface Description")

The interface supports event contract position settlement message push, subscribeType only supports = 2. Event settlement messages require the latest SDK version.

### Position events subscribe Proto protocol definition.[​](#position-events-subscribe-proto-protocol-definition "Direct link to Position events subscribe Proto protocol definition.")

**Request Proto**

```
message SubscribeRequest {  
	 uint32 subscribeType = 1; // Subscription type  
	 int64 timestamp = 2; // Timestamp  
	 string contentType = 3; // Content type  
	 string payload = 4; // Content  
	 repeated string accounts = 5; // Account ID  
}
```

**Response Proto**

```
message SubscribeResponse {  
	 EventType eventType = 1; // Event type  
	 uint32 subscribeType = 2; // Subscription type  
	 string contentType = 3; // Subscription type  
	 string payload = 4; // Content  
	 string requestId = 5; // Request id  
	 int64  timestamp = 6; // Timestamp  
}
```

**EventType enumeration**

```
enum EventType {  
	SubscribeSuccess = 0; // Subscription succeeded  
	Ping = 1; // Heartbeat information  
	AuthError = 2; // Authentication error  
	NumOfConnExceed = 3; // Connection limit exceeded  
	SubscribeExpired = 4; // Subscription expired  
}
```

### Request Example[​](#request-example "Direct link to Request Example")

* Python
* Java

In the following case, the \_on\_log method is used to output the log. The my\_on\_events\_message method is to receive order status change messages.

```
import logging  
  
from webull.trade.events.types import EVENT_TYPE_POSITION, POSITION_STATUS_CHANGED  
from webull.trade.trade_events_client import TradeEventsClient  
  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
account_id = "<your_account_id>"  
region_id = "us"  
  
# PRD env host: events-api.webull.com  
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "<event_api_endpoint>"  
  
  
def _on_log(level, log_content):  
    print(logging.getLevelName(level), log_content)  
  
  
def my_on_events_message(event_type, subscribe_type, payload, raw_message):  
    if EVENT_TYPE_POSITION == event_type and POSITION_STATUS_CHANGED == subscribe_type:  
        print('event payload:%s' % payload)  
  
if __name__ == '__main__':  
  
    # Create EventsClient instance  
    trade_events_client = TradeEventsClient(your_app_key, your_app_secret, region_id)  
    # For non production environment, you need to set the domain name of the subscription service through eventsclient. For example, the domain name of the UAT environment is set here  
    # trade_events_client = TradeEventsClient(your_app_key, your_app_secret, region_id, host=optional_api_endpoint)  
    trade_events_client.on_log = _on_log  
  
    # Set the callback function when the event data is received.  
    # The data of order status change is printed here  
  
    trade_events_client.on_events_message = my_on_events_message  
    # Set the account ID to be subscribed and initiate the subscription. This method is synchronous  
    trade_events_client.do_subscribe([account_id])
```

The handleEventMessage method is to receive order status change messages.

```
import com.google.gson.reflect.TypeToken;  
import com.webull.openapi.core.execption.ClientException;  
import com.webull.openapi.core.execption.ServerException;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.serialize.JsonSerializer;  
import com.webull.openapi.samples.config.Env;  
import com.webull.openapi.trade.events.subscribe.ISubscription;  
import com.webull.openapi.trade.events.subscribe.ITradeEventClient;  
import com.webull.openapi.trade.events.subscribe.message.EventType;  
import com.webull.openapi.trade.events.subscribe.message.SubscribeRequest;  
import com.webull.openapi.trade.events.subscribe.message.SubscribeResponse;  
  
import java.util.Map;  
  
public class TradeEventsClient {  
  
    private static final Logger logger = LoggerFactory.getLogger(TradeEventsClient.class);  
  
    public static void main(String[] args) {  
        try (ITradeEventClient client = ITradeEventClient.builder()  
                .appKey(Env.APP_KEY)  
                .appSecret(Env.APP_SECRET)  
                .regionId(Env.REGION_ID)  
                // .host("<event_api_endpoint>")  
                .onMessage(TradeEventsClient::handleEventMessage)  
                .build()) {  
  
            SubscribeRequest request = new SubscribeRequest("<your_account_id>");  
  
            ISubscription subscription = client.subscribe(request);  
            subscription.blockingAwait();  
  
        } catch (ClientException ex) {  
            logger.error("Client error", ex);  
        } catch (ServerException ex) {  
            logger.error("Sever error", ex);  
        } catch (Exception ex) {  
            logger.error("Unknown error", ex);  
        }  
    }  
  
    private static void handleEventMessage(SubscribeResponse response) {  
        if (SubscribeResponse.CONTENT_TYPE_JSON.equals(response.getContentType())) {  
            Map<String, String> payload = JsonSerializer.fromJson(response.getPayload(),  
                    new TypeToken<Map<String, String>>(){}.getType());  
            if (EventType.Position.getCode() == response.getEventType()) {  
                logger.info("{}", payload);  
            }  
        }  
    }  
}
```

### Response Example[​](#response-example "Direct link to Response Example")

Position event scene type

* EVENT CONTRACT

```
{  
    "event_name": "Number of rate cuts in 2025",  
    "yes_condition": "Exactly 8 cuts",  
    "settle_result": "Yes",  
    "settle_side": "Yes",  
    "quantity": "40",  
    "cost": "20.00",  
    "settle_amount": "40.00"  
}  
DEBUG response:eventType: Ping  
subscribeType: 2  
contentType: "text/plain"  
requestId: "ab39b532-3ad4-46c4-823d-3dff12e0f1b9"  
timestamp: 1768994319673
```

---

# URL: https://developer.webull.com/apis/docs/reference/custom/subscribe-trade-events

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Trade Events](/apis/docs/reference/custom/events)
* Subscribe Trade Events

On this page

# Subscribe Trade Events

### Interface Description[​](#interface-description "Direct link to Interface Description")

Trade events subscription is a `server streaming` persistent connection implemented based on `gRPC`, which is suitable for connecting Webull customers through the OpenAPI development platform. The trade events subscription fully follows the `gRPC` open source protocol, and you can refer to the [gRPC open source](https://grpc.io/docs/) library when using it.

Currently, the interface supports order status change message push, and the supported scenarios are as follows:

| scene\_type | Description |
| --- | --- |
| FILLED | Partially filled |
| FINAL\_FILLED | All filled |
| PLACE\_FAILED | Order failed |
| MODIFY\_SUCCESS | Change order successfully |
| MODIFY\_FAILED | Change order failed |
| CANCEL\_SUCCESS | Cancellation succeeded |
| CANCEL\_FAILED | Cancellation failed |

### Trade events subscribe Proto protocol definition.[​](#trade-events-subscribe-proto-protocol-definition "Direct link to Trade events subscribe Proto protocol definition.")

**Request Proto**

```
message SubscribeRequest {  
	 uint32 subscribeType = 1; // Subscription type  
	 int64 timestamp = 2; // Timestamp  
	 string contentType = 3; // Content type  
	 string payload = 4; // Content  
	 repeated string accounts = 5; // Account ID  
}
```

**Response Proto**

```
message SubscribeResponse {  
	 EventType eventType = 1; // Event type  
	 uint32 subscribeType = 2; // Subscription type  
	 string contentType = 3; // Subscription type  
	 string payload = 4; // Content  
	 string requestId = 5; // Request id  
	 int64  timestamp = 6; // Timestamp  
}
```

**EventType enumeration**

```
enum EventType {  
	SubscribeSuccess = 0; // Subscription succeeded  
	Ping = 1; // Heartbeat information  
	AuthError = 2; // Authentication error  
	NumOfConnExceed = 3; // Connection limit exceeded  
	SubscribeExpired = 4; // Subscription expired  
}
```

### Request Example[​](#request-example "Direct link to Request Example")

* Python
* Java

When using sdk request, subscribeType, timestamp, contentType, and payload can be ignored. Just pass in the accounts. subscribeType currently only supports =1.
In the following case, the \_on\_log method is used to output the log. The my\_on\_events\_message method is to receive order status change messages.

```
import logging  
  
from webull.trade.events.types import ORDER_STATUS_CHANGED, EVENT_TYPE_ORDER  
from webull.trade.trade_events_client import TradeEventsClient  
  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
account_id = "<your_account_id>"  
region_id = "us"  
  
# PRD env host: events-api.webull.com  
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "<event_api_endpoint>"  
  
  
def _on_log(level, log_content):  
    print(logging.getLevelName(level), log_content)  
  
  
def my_on_events_message(event_type, subscribe_type, payload, raw_message):  
    if EVENT_TYPE_ORDER == event_type and ORDER_STATUS_CHANGED == subscribe_type:  
        print('%s' % payload)  
  
if __name__ == '__main__':  
  
    # Create EventsClient instance  
    trade_events_client = TradeEventsClient(your_app_key, your_app_secret, region_id)  
    # For non production environment, you need to set the domain name of the subscription service through eventsclient. For example, the domain name of the UAT environment is set here  
    # trade_events_client = TradeEventsClient(your_app_key, your_app_secret, region_id, host=optional_api_endpoint)  
    trade_events_client.on_log = _on_log  
  
    # Set the callback function when the event data is received.  
    # The data of order status change is printed here  
  
    trade_events_client.on_events_message = my_on_events_message  
    # Set the account ID to be subscribed and initiate the subscription. This method is synchronous  
    trade_events_client.do_subscribe([account_id])
```

The handleEventMessage method is to receive order status change messages.

```
import com.google.gson.reflect.TypeToken;  
import com.webull.openapi.core.execption.ClientException;  
import com.webull.openapi.core.execption.ServerException;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.serialize.JsonSerializer;  
import com.webull.openapi.samples.config.Env;  
import com.webull.openapi.trade.events.subscribe.ISubscription;  
import com.webull.openapi.trade.events.subscribe.ITradeEventClient;  
import com.webull.openapi.trade.events.subscribe.message.EventType;  
import com.webull.openapi.trade.events.subscribe.message.SubscribeRequest;  
import com.webull.openapi.trade.events.subscribe.message.SubscribeResponse;  
  
import java.util.Map;  
  
public class TradeEventsClient {  
  
    private static final Logger logger = LoggerFactory.getLogger(TradeEventsClient.class);  
  
    public static void main(String[] args) {  
        try (ITradeEventClient client = ITradeEventClient.builder()  
                .appKey(Env.APP_KEY)  
                .appSecret(Env.APP_SECRET)  
                .regionId(Env.REGION_ID)  
                // .host("<event_api_endpoint>")  
                .onMessage(TradeEventsClient::handleEventMessage)  
                .build()) {  
  
            SubscribeRequest request = new SubscribeRequest("<your_account_id>");  
  
            ISubscription subscription = client.subscribe(request);  
            subscription.blockingAwait();  
  
        } catch (ClientException ex) {  
            logger.error("Client error", ex);  
        } catch (ServerException ex) {  
            logger.error("Sever error", ex);  
        } catch (Exception ex) {  
            logger.error("Unknown error", ex);  
        }  
    }  
  
    private static void handleEventMessage(SubscribeResponse response) {  
        if (SubscribeResponse.CONTENT_TYPE_JSON.equals(response.getContentType())) {  
            Map<String, String> payload = JsonSerializer.fromJson(response.getPayload(),  
                    new TypeToken<Map<String, String>>(){}.getType());  
            if (EventType.Order.getCode() == response.getEventType() || EventType.Position.getCode() == response.getEventType()) {  
                logger.info("{}", payload);  
            }  
        }  
    }  
}
```

### Response Example[​](#response-example "Direct link to Response Example")

Transaction event scene type

* FILLED
* FINAL\_FILLED
* PLACE\_FAILED
* MODIFY\_SUCCESS
* CANCEL\_SUCCESS

```
{  
    "request_id": "1045473299175309312",  
    "account_id": "4MHSOMIJ88O7E80VBG0O4G6E9A",  
    "client_order_id": "5783758dc6c240c6811c0cbea60c72d8",  
    "instrument_id": "913256135",  
    "order_status": "SUBMITTED",  
    "symbol": "AAPL",  
    "qty": "10.00",  
    "filled_price": "180.00",  
    "filled_qty": "1.00",  
    "filled_time": "2025-11-21T06:23:28.601+0000",  
    "side": "BUY",  
    "scene_type": "FILLED",  
    "category": "US_STOCK",  
    "order_type": "LIMIT"  
}  
DEBUG response:eventType: Ping  
subscribeType: 1  
contentType: "text/plain"  
requestId: "486daa2d-7be8-438f-b7fa-ecafa3d0e89f"  
timestamp: 1763706218682
```

```
{  
    "request_id": "1045474398137483264",  
    "account_id": "4MHSOMIJ88O7E80VBG0O4G6E9A",  
    "client_order_id": "db74f19918054a7e9bb72067731c9ae4",  
    "instrument_id": "913256135",  
    "order_status": "FILLED",  
    "symbol": "AAPL",  
    "qty": "10.00",  
    "filled_price": "180.00",  
    "filled_qty": "10.00",  
    "filled_time": "2025-11-21T06:27:43.312+0000",  
    "side": "BUY",  
    "scene_type": "FINAL_FILLED",  
    "category": "US_STOCK",  
    "order_type": "LIMIT"  
}  
DEBUG response:eventType: Ping  
subscribeType: 1  
contentType: "text/plain"  
requestId: "486daa2d-7be8-438f-b7fa-ecafa3d0e89f"  
timestamp: 1763706478682
```

```
{  
    "request_id": "1045474643156140032",  
    "account_id": "4MHSOMIJ88O7E80VBG0O4G6E9A",  
    "client_order_id": "de2868b71c154bcaafd2baca61127966",  
    "instrument_id": "913256135",  
    "order_status": "FAILED",  
    "symbol": "AAPL",  
    "qty": "10.00",  
    "filled_qty": "0.000",  
    "side": "BUY",  
    "scene_type": "PLACE_FAILED",  
    "category": "US_STOCK",  
    "order_type": "LIMIT"  
}  
DEBUG response:eventType: Ping  
subscribeType: 1  
contentType: "text/plain"  
requestId: "486daa2d-7be8-438f-b7fa-ecafa3d0e89f"  
timestamp: 1763706538682
```

```
{  
    "request_id": "1045475396583161856",  
    "account_id": "4MHSOMIJ88O7E80VBG0O4G6E9A",  
    "client_order_id": "92ba046cd87f43c3a93e798877ae1bb8",  
    "instrument_id": "913256135",  
    "order_status": "SUBMITTED",  
    "symbol": "AAPL",  
    "qty": "10.00",  
    "filled_qty": "0.000",  
    "side": "BUY",  
    "scene_type": "MODIFY_SUCCESS",  
    "category": "US_STOCK",  
    "order_type": "LIMIT"  
}  
DEBUG response:eventType: Ping  
subscribeType: 1  
contentType: "text/plain"  
requestId: "486daa2d-7be8-438f-b7fa-ecafa3d0e89f"  
timestamp: 1763706758682
```

```
{  
    "request_id": "1045475396583161856",  
    "account_id": "4MHSOMIJ88O7E80VBG0O4G6E9A",  
    "client_order_id": "92ba046cd87f43c3a93e798877ae1bb8",  
    "instrument_id": "913256135",  
    "order_status": "CANCELLED",  
    "symbol": "AAPL",  
    "qty": "10.00",  
    "filled_qty": "0.000",  
    "side": "BUY",  
    "scene_type": "CANCEL_SUCCESS",  
    "category": "US_STOCK",  
    "order_type": "LIMIT"  
}  
DEBUG response:eventType: Ping  
subscribeType: 1  
contentType: "text/plain"  
requestId: "486daa2d-7be8-438f-b7fa-ecafa3d0e89f"  
timestamp: 1763706758682
```

---

# URL: https://developer.webull.com/apis/docs/reference/custom/trading-api

* Trading API

# Trading API

Trading API Management Interfaces

[## 🗃️ Instrument

9 items](/apis/docs/reference/instrument)

[## 🗃️ Account

1 item](/apis/docs/reference/account)

[## 🗃️ Assets

2 items](/apis/docs/reference/assets)

[## 🗃️ Order

5 items](/apis/docs/reference/custom/order)

---

# URL: https://developer.webull.com/apis/docs/reference/event-bars

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Event](/apis/docs/reference/event-market-data)
* Bars

# Bars

```
GET

## /openapi/market-data/event/bars
```

• Function description: Query the most recent N candlestick charts based on event symbol, time granularity, and type. Supports historical candlestick charts at various granularities such as M1 and M5.   
• Frequency limit: Market-data Interfaces Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/event-categories-list

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Event Contract Categories

# Get Event Contract Categories

```
GET

## /openapi/instrument/event/categories
```

• Function: Search all categories under the Event Contract.  
• Rate Limit: 60 requests per 60 seconds.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/event-depth

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Event](/apis/docs/reference/event-market-data)
* Depth

# Depth

```
GET

## /openapi/market-data/event/depth
```

• Function description: Get the current order book for a specific event instrument. The order book shows all active bid orders for both yes and no sides of a binary market. It returns yes bids and no bids only (no asks are returned).This is because in binary markets, a bid for yes at price X is equivalent to an ask for no at price (100-X). For example, a yes bid at 6¢ is the same as a no ask at 94¢, with identical contract sizes.  
• Frequency limit: Market-data Interfaces Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/event-events-list

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Event Contract events

# Get Event Contract events

```
GET

## /openapi/instrument/event/series/events
```

• Function: Search for events under the Event Contract.  
• Rate Limit: 60 requests per 60 seconds.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/event-market-data

* [Market Data API](/apis/docs/reference/custom/market-data)
* Event

# Event Market Data

Event Market Data Interfaces

[## 📄️ Snapshot

• Function description: Get real-time market snapshot data for a event instrument.<br/>• Frequency limit: Market-data Interfaces Rate limit 600 requests per minute](/apis/docs/reference/event-snapshot)

[## 📄️ Depth

• Function description: Get the current order book for a specific event instrument. The order book shows all active bid orders for both yes and no sides of a binary market. It returns yes bids and no bids only (no asks are returned).This is because in binary markets, a bid for yes at price X is equivalent to an ask for no at price (100-X). For example, a yes bid at 6¢ is the same as a no ask at 94¢, with identical contract sizes.<br/>• Frequency limit: Market-data Interfaces Rate limit 600 requests per minute](/apis/docs/reference/event-depth)

[## 📄️ Bars

• Function description: Query the most recent N candlestick charts based on event symbol, time granularity, and type. Supports historical candlestick charts at various granularities such as M1 and M5. <br/>• Frequency limit: Market-data Interfaces Rate limit 600 requests per minute](/apis/docs/reference/event-bars)

[## 📄️ Tick

• Function description: Detailed transaction records, including transaction time, price, quantity, and transaction direction. Data is sorted in reverse chronological order, with the most recent transaction record first. <br/>• Frequency limit: Market-data Interfaces Rate limit 600 requests per minute](/apis/docs/reference/event-tick)

---

# URL: https://developer.webull.com/apis/docs/reference/event-market-list

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Event Contract Instrument

# Get Event Contract Instrument

```
GET

## /openapi/instrument/event/market/list
```

• Function: Retrieve profile information for event contract markets based on the series symbol.  
• Rate Limit: 60 requests per 60 seconds.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/event-series-list

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Event Contract Series

# Get Event Contract Series

```
GET

## /openapi/instrument/event/series/list
```

• Function: Retrieve multiple series with specified filters. A series represents a template for recurring events that follow the same format and rules (e.g., “Monthly Jobs Report” ). This endpoint allows you to browse and discover available series templates by category.  
• Rate Limit: 60 requests per 60 seconds.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/event-snapshot

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Event](/apis/docs/reference/event-market-data)
* Snapshot

# Snapshot

```
GET

## /openapi/market-data/event/snapshot
```

• Function description: Get real-time market snapshot data for a event instrument.  
• Frequency limit: Market-data Interfaces Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/event-tick

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Event](/apis/docs/reference/event-market-data)
* Tick

# Tick

```
GET

## /openapi/market-data/event/tick
```

• Function description: Detailed transaction records, including transaction time, price, quantity, and transaction direction. Data is sorted in reverse chronological order, with the most recent transaction record first.   
• Frequency limit: Market-data Interfaces Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/footprint

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Stock](/apis/docs/reference/stock-market-data)
* Footprint

# Footprint

```
GET

## /openapi/market-data/stock/footprint
```

• Function description: Query the most recent N footprint records based on stock symbol, and category, time granularity.  
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/futures-depth-of-book

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Futures](/apis/docs/reference/futures-market-data)
* Depth of Book

# Depth of Book

```
GET

## /openapi/market-data/futures/depth
```

Get the latest bid/ask data for a security with a level-2 subscription.. Returns bid/ask information for a specified depth, including price, quantity.   
Frequency limit: 1 call per second per App Key.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/futures-footprint

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Futures](/apis/docs/reference/futures-market-data)
* Footprint

# Footprint

```
GET

## /openapi/market-data/futures/footprint
```

• Function description: Query the most recent N footprint records based on futures symbol, and category, time granularity.  
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/futures-historical-bars

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Futures](/apis/docs/reference/futures-market-data)
* Historical Bars

# Historical Bars

```
GET

## /openapi/market-data/futures/bars
```

Batch query interface. Query the recent N bars of data based on futures symbols, time granularity, and type. Supports historical bars of various granularities like M1, M5, etc. Currently, daily bars (D) and above only provide forward-adjusted bars; minute bars provide unadjusted bars.  
Frequency limit: 1 call per second per App Key.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/futures-instrument-list

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Futures Instrument

# Get Futures Instrument

```
GET

## /openapi/instrument/futures/list
```

• Function: Retrieve profile information for one or multiple futures trading instruments by symbol(s).  
• Rate Limit: 60 requests per 60 seconds.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/futures-instrument-list-by-code

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Futures Instrument By Code

# Get Futures Instrument By Code

```
GET

## /openapi/instrument/futures/by-code
```

• Function: Retrieve profile information for tradable futures trading instruments based on the futures product code.  
• Rate Limit: 60 requests per 60 seconds.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/futures-market-data

* [Market Data API](/apis/docs/reference/custom/market-data)
* Futures

# Futures Market Data

Futures Market Data Interfaces.  
  
 Currently, access to futures data via the OpenAPI requires a paid market-data subscription, which grants the necessary authorization. This subscription module is under active development and will be released soon—please stay tuned.

[## 📄️ Tick

Get tick-by-tick trade data for a security. Returns detailed tick trade records within a specified time range for a given security, including trade time, price, volume, direction. Data is sorted in reverse chronological order (latest first). <br/>Frequency limit: 1 call per second per App Key.](/apis/docs/reference/futures-tick)

[## 📄️ Snapshot

Get real-time market snapshot data for a security. Returns key market indicators such as latest price, price change, volume, turnover rate, etc. <br/>Frequency limit: 1 call per second per App Key.](/apis/docs/reference/futures-snapshot)

[## 📄️ Footprint

• Function description: Query the most recent N footprint records based on futures symbol, and category, time granularity.<br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/futures-footprint)

[## 📄️ Depth of Book

Get the latest bid/ask data for a security with a level-2 subscription.. Returns bid/ask information for a specified depth, including price, quantity. <br/>Frequency limit: 1 call per second per App Key.](/apis/docs/reference/futures-depth-of-book)

[## 📄️ Historical Bars

Batch query interface. Query the recent N bars of data based on futures symbols, time granularity, and type. Supports historical bars of various granularities like M1, M5, etc. Currently, daily bars (D) and above only provide forward-adjusted bars; minute bars provide unadjusted bars.<br/>Frequency limit: 1 call per second per App Key.](/apis/docs/reference/futures-historical-bars)

---

# URL: https://developer.webull.com/apis/docs/reference/futures-products

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Futures Products

# Get Futures Products

```
GET

## /openapi/instrument/futures/products
```

• Retrieve all futures underlying products and their corresponding product codes, returned as a list.  
• Rate Limit: 60 requests per 60 seconds.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/futures-snapshot

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Futures](/apis/docs/reference/futures-market-data)
* Snapshot

# Snapshot

```
GET

## /openapi/market-data/futures/snapshot
```

Get real-time market snapshot data for a security. Returns key market indicators such as latest price, price change, volume, turnover rate, etc.   
Frequency limit: 1 call per second per App Key.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/futures-tick

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Futures](/apis/docs/reference/futures-market-data)
* Tick

# Tick

```
GET

## /openapi/market-data/futures/tick
```

Get tick-by-tick trade data for a security. Returns detailed tick trade records within a specified time range for a given security, including trade time, price, volume, direction. Data is sorted in reverse chronological order (latest first).   
Frequency limit: 1 call per second per App Key.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/historical-bars

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Stock](/apis/docs/reference/stock-market-data)
* Historical Bars

# Historical Bars

```
POST

## /openapi/market-data/stock/batch-bars
```

• Function description: Batch query interface. Query the recent N bars of data based on stock symbols, time granularity, and type. Supports historical bars of various granularities like M1, M5, etc. Currently, daily bars (D) and above only provide forward-adjusted bars; minute bars provide unadjusted bars.   
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/instrument

* [Trading API](/apis/docs/reference/custom/trading-api)
* Instrument

# Instrument

Instrument Interfaces

[## 📄️ Get Stock Instrument

• Function description: Get profile information for one or more instruments.<br/>• Frequency limit: Rate limit 60 requests every 60 seconds](/apis/docs/reference/instrument-list)

[## 📄️ Get Crypto Instrument

• Function description: Get profile information for one or more instruments.<br/>• Frequency limit: Rate limit 60 requests every 60 seconds](/apis/docs/reference/crypto-instrument-list)

[## 📄️ Get Futures Products

• Retrieve all futures underlying products and their corresponding product codes, returned as a list.<br/>• Rate Limit: 60 requests per 60 seconds.](/apis/docs/reference/futures-products)

[## 📄️ Get Futures Instrument By Code

• Function: Retrieve profile information for tradable futures trading instruments based on the futures product code.<br/>• Rate Limit: 60 requests per 60 seconds.](/apis/docs/reference/futures-instrument-list-by-code)

[## 📄️ Get Futures Instrument

• Function: Retrieve profile information for one or multiple futures trading instruments by symbol(s).<br/>• Rate Limit: 60 requests per 60 seconds.](/apis/docs/reference/futures-instrument-list)

[## 📄️ Get Event Contract Categories

• Function: Search all categories under the Event Contract.<br/>• Rate Limit: 60 requests per 60 seconds.](/apis/docs/reference/event-categories-list)

[## 📄️ Get Event Contract Series

• Function: Retrieve multiple series with specified filters. A series represents a template for recurring events that follow the same format and rules (e.g., “Monthly Jobs Report” ). This endpoint allows you to browse and discover available series templates by category.<br/>• Rate Limit: 60 requests per 60 seconds.](/apis/docs/reference/event-series-list)

[## 📄️ Get Event Contract events

• Function: Search for events under the Event Contract.<br/>• Rate Limit: 60 requests per 60 seconds.](/apis/docs/reference/event-events-list)

[## 📄️ Get Event Contract Instrument

• Function: Retrieve profile information for event contract markets based on the series symbol.<br/>• Rate Limit: 60 requests per 60 seconds.](/apis/docs/reference/event-market-list)

---

# URL: https://developer.webull.com/apis/docs/reference/instrument-list

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Instrument](/apis/docs/reference/instrument)
* Get Stock Instrument

# Get Stock Instrument

```
GET

## /openapi/instrument/stock/list
```

• Function description: Get profile information for one or more instruments.  
• Frequency limit: Rate limit 60 requests every 60 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/market-data-streaming

* [Market Data API](/apis/docs/reference/custom/market-data)
* Streaming

# Market Data/Streaming

Market Data Streaming Interface

[## 📄️ Unsubscribe

• Function description: After successfully establishing the market data streaming MQTT connection, call this interface to unsubscribe from real-time market data push. Successful call returns no value; failures return an Error. Unsubscribing will release the topic quota. Frequency limit: 1 call per second per App Key.• <br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/unsubscribe)

[## 📄️ Subscribe

• Function description: Subscribe to real-time market data streaming. This interface allows you to subscribe to various types of market data including quotes, snapshots, and tick data for specified securities.• <br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/subscribe)

---

# URL: https://developer.webull.com/apis/docs/reference/option

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* Option

# Option

Option Order Management Interface

[## 📄️ Preview Options

• Function description: Calculate the estimated amount and cost of options orders according to the incoming information. Only supports OPTION.<br/>• Frequency limit: Rate limit 150 requests every 10 seconds](/apis/docs/reference/option-preview)

[## 📄️ Place Options

• Function description: Place options orders. Only supports OPTION.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/option-place)

[## 📄️ Replace Options

• Function description: Updates an existing order with new parameters; each one overrides the corresponding attribute. Only supports OPTION.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/option-replace)

[## 📄️ Cancel Options

• Function description: Cancel options orders according to the incoming client\_order\_id. Only supports OPTION.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/option-cancel)

---

# URL: https://developer.webull.com/apis/docs/reference/option-cancel

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Option](/apis/docs/reference/option)
* Cancel Options

# Cancel Options

```
POST

## /openapi/trade/option/order/cancel
```

• Function description: Cancel options orders according to the incoming client\_order\_id. Only supports OPTION.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/option-place

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Option](/apis/docs/reference/option)
* Place Options

# Place Options

```
POST

## /openapi/trade/option/order/place
```

• Function description: Place options orders. Only supports OPTION.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/option-preview

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Option](/apis/docs/reference/option)
* Preview Options

# Preview Options

```
POST

## /openapi/trade/option/order/preview
```

• Function description: Calculate the estimated amount and cost of options orders according to the incoming information. Only supports OPTION.  
• Frequency limit: Rate limit 150 requests every 10 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/option-replace

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Option](/apis/docs/reference/option)
* Replace Options

# Replace Options

```
POST

## /openapi/trade/option/order/replace
```

• Function description: Updates an existing order with new parameters; each one overrides the corresponding attribute. Only supports OPTION.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/order-batch-place

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Trading(recommended)](/apis/docs/reference/trading)
* Order Batch Place

# Order Batch Place

```
POST

## /openapi/trade/order/batch-place
```

• Function description: Batch Place order, allows multiple orders to be submitted at once.  
A maximum of 50 orders can be submitted once, Currently only stocks are supported（This service is not currently available to all clients. Please contact Webull if you require assistance.）  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

Request successful

---

# URL: https://developer.webull.com/apis/docs/reference/order-detail

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Order Query](/apis/docs/reference/order-query)
* Order Detail

# Order Detail

```
GET

## /openapi/trade/order/detail
```

• Function description: Order details, query the specified order details through the order ID.  
• Frequency limit: Rate limit 2 requests every 2 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/order-history

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Order Query](/apis/docs/reference/order-query)
* Order History

# Order History

```
GET

## /openapi/trade/order/history
```

• Function description: Historical orders, query the records of the past 7 days. If they are group orders, will be returned together, and the number of orders returned on one page may exceed the page\_size.  
• Frequency limit: Rate limit 2 requests every 2 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/order-open

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Order Query](/apis/docs/reference/order-query)
* Open Order

# Open Order

```
GET

## /openapi/trade/order/open
```

• Function description: Query pending orders by page, and modify or cancel orders based on client\_order\_id.  
• Frequency limit: Rate limit 2 requests every 2 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/order-query

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* Order Query

# Order Query

Order Management Interfaces

[## 📄️ Order History

• Function description: Historical orders, query the records of the past 7 days. If they are group orders, will be returned together, and the number of orders returned on one page may exceed the page\_size.<br/>• Frequency limit: Rate limit 2 requests every 2 seconds](/apis/docs/reference/order-history)

[## 📄️ Open Order

• Function description: Query pending orders by page, and modify or cancel orders based on client\_order\_id.<br/>• Frequency limit: Rate limit 2 requests every 2 seconds](/apis/docs/reference/order-open)

[## 📄️ Order Detail

• Function description: Order details, query the specified order details through the order ID.<br/>• Frequency limit: Rate limit 2 requests every 2 seconds](/apis/docs/reference/order-detail)

---

# URL: https://developer.webull.com/apis/docs/reference/place-order

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Stock](/apis/docs/reference/stock)
* Place Order

# Place Order

```
POST

## /openapi/trade/stock/order/place
```

• Function description: Place equity orders (preferred), including simple orders. Only supports EQUITY.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/preview-order

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Stock](/apis/docs/reference/stock)
* Preview Order

# Preview Order

```
POST

## /openapi/trade/stock/order/preview
```

• Function description: Calculate the estimated amount and cost based on the incoming information, and support simple orders. Only supports EQUITY.  
• Frequency limit: Rate limit 150 requests every 10 seconds

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/quotes

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Stock](/apis/docs/reference/stock-market-data)
* Quotes

# Quotes

```
GET

## /openapi/market-data/stock/quotes
```

• Function description: Get the latest bid/ask data for a security. Returns bid/ask information for a specified depth, including price, quantity, order details, etc.  
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/replace-order

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* [Stock](/apis/docs/reference/stock)
* Replace Order

# Replace Order

```
POST

## /openapi/trade/stock/order/replace
```

• Function description: Updates an existing order with new parameters; each one overrides the corresponding attribute. Only supports EQUITY.  
• Frequency limit: Rate limit 600 requests per minute

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200
* 417

OK

---

# URL: https://developer.webull.com/apis/docs/reference/snapshot

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Stock](/apis/docs/reference/stock-market-data)
* Snapshot

# Snapshot

```
GET

## /openapi/market-data/stock/snapshot
```

• Function description: Get real-time market snapshot data for a security. Returns key market indicators such as latest price, price change, volume, turnover rate, etc. Supports querying various security types including US stocks, with optional inclusion of pre-market, after-hours, and overnight trading data.   
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/stock

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* Stock

# Stock

Stock Order Management Interface

[## 📄️ Preview Order

• Function description: Calculate the estimated amount and cost based on the incoming information, and support simple orders. Only supports EQUITY.<br/>• Frequency limit: Rate limit 150 requests every 10 seconds](/apis/docs/reference/preview-order)

[## 📄️ Place Order

• Function description: Place equity orders (preferred), including simple orders. Only supports EQUITY.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/place-order)

[## 📄️ Replace Order

• Function description: Updates an existing order with new parameters; each one overrides the corresponding attribute. Only supports EQUITY.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/replace-order)

[## 📄️ Cancel Order

• Function description: Cancel the equity order according to the incoming client\_order\_id. Only supports EQUITY.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/cancel-order)

---

# URL: https://developer.webull.com/apis/docs/reference/stock-market-data

* [Market Data API](/apis/docs/reference/custom/market-data)
* Stock

# Stock Market Data

Stock Market Data Interfaces

[## 📄️ Tick

• Function description: Get tick-by-tick trade data for a security. Returns detailed tick trade records within a specified time range for a given security, including trade time, price, volume, direction, and other details. Data is sorted in reverse chronological order (latest first).<br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/tick)

[## 📄️ Snapshot

• Function description: Get real-time market snapshot data for a security. Returns key market indicators such as latest price, price change, volume, turnover rate, etc. Supports querying various security types including US stocks, with optional inclusion of pre-market, after-hours, and overnight trading data. <br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/snapshot)

[## 📄️ Quotes

• Function description: Get the latest bid/ask data for a security. Returns bid/ask information for a specified depth, including price, quantity, order details, etc.<br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/quotes)

[## 📄️ Footprint

• Function description: Query the most recent N footprint records based on stock symbol, and category, time granularity.<br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/footprint)

[## 📄️ Historical Bars

• Function description: Batch query interface. Query the recent N bars of data based on stock symbols, time granularity, and type. Supports historical bars of various granularities like M1, M5, etc. Currently, daily bars (D) and above only provide forward-adjusted bars; minute bars provide unadjusted bars. <br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/historical-bars)

[## 📄️ Historical Bars (single symbol)

• Function description: Query the recent N bars of data based on stock symbol, time granularity, and type. Supports historical bars of various granularities like M1, M5, etc. Currently, daily bars (D) and above only provide forward-adjusted bars; minute bars provide unadjusted bars.<br/>• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.](/apis/docs/reference/bars)

---

# URL: https://developer.webull.com/apis/docs/reference/subscribe

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Streaming](/apis/docs/reference/market-data-streaming)
* Subscribe

# Subscribe

```
POST

## /openapi/market-data/streaming/subscribe
```

• Function description: Subscribe to real-time market data streaming. This interface allows you to subscribe to various types of market data including quotes, snapshots, and tick data for specified securities.•   
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/tick

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Stock](/apis/docs/reference/stock-market-data)
* Tick

# Tick

```
GET

## /openapi/market-data/stock/tick
```

• Function description: Get tick-by-tick trade data for a security. Returns detailed tick trade records within a specified time range for a given security, including trade time, price, volume, direction, and other details. Data is sorted in reverse chronological order (latest first).  
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/reference/trading

* [Trading API](/apis/docs/reference/custom/trading-api)
* [Order](/apis/docs/reference/custom/order)
* Trading(recommended)

# Trading

Order Management Interfaces

[## 📄️ Order Preview

• Function description: Calculate the estimated amount and cost based on the incoming information, and support simple orders. For crypto trading, this feature is currently not supported.<br/>• Frequency limit: Rate limit 150 requests every 10 seconds](/apis/docs/reference/common-order-preview)

[## 📄️ Order Place

• Function description: Place equity orders (preferred), including simple orders.<br/>For futures, only quantity orders are supported.<br/>Please note: When selling crypto, your position must not fall below $2 after placing the order.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/common-order-place)

[## 📄️ Order Batch Place

• Function description: Batch Place order, allows multiple orders to be submitted at once.<br/>A maximum of 50 orders can be submitted once, Currently only stocks are supported（This service is not currently available to all clients. Please contact Webull if you require assistance.）<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/order-batch-place)

[## 📄️ Order Replace

• Function description: Modify equity, options and futures orders, including simple orders. For crypto trading, this feature is currently not supported.<br/>• Futures order modification rules:<br/>&nbsp;&nbsp;- For market orders, only `quantity` can be modified.<br/>&nbsp;&nbsp;- For limit orders, only `order\_type`, `time\_in\_force`, `quantity` and `limit\_price` can be modified; if modifying `order\_type`, it can only be changed to `market`.<br/>&nbsp;&nbsp;- For stop orders, only `order\_type`, `time\_in\_force`, `quantity` and `stop\_price` can be modified; if modifying `order\_type`, it can only be changed to `market`.<br/>&nbsp;&nbsp;- For stop limit orders, only `order\_type`, `time\_in\_force`, `quantity`, `limit\_price` and `stop\_price` can be modified; if modifying `order\_type`, it can only be changed to `limit`.<br/>&nbsp;&nbsp;- For trailing stop orders, only `trailing\_stop\_step` can be modified; `order\_type` , `trailing\_type` and `time\_in\_force` cannot be modified.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/common-order-replace)

[## 📄️ Order Cancel

• Function description: Cancel orders for equities, options, futures and cryptos according to the incoming account\_id and client\_order\_id.<br/>• Frequency limit: Rate limit 600 requests per minute](/apis/docs/reference/common-order-cancel)

---

# URL: https://developer.webull.com/apis/docs/reference/unsubscribe

* [Market Data API](/apis/docs/reference/custom/market-data)
* [Streaming](/apis/docs/reference/market-data-streaming)
* Unsubscribe

# Unsubscribe

```
POST

## /openapi/market-data/streaming/unsubscribe
```

• Function description: After successfully establishing the market data streaming MQTT connection, call this interface to unsubscribe from real-time market data push. Successful call returns no value; failures return an Error. Unsubscribing will release the topic quota. Frequency limit: 1 call per second per App Key.•   
• Frequency limit: Market-data interfaces rate limit is 600 requests per minute.

## Request[​](#request "Direct link to Request")

## Responses[​](#responses "Direct link to Responses")

* 200

OK

---

# URL: https://developer.webull.com/apis/docs/resources

* Additional Resources

On this page

# Additional Resources

### Webull Learn[​](#webull-learn "Direct link to Webull Learn")

We regularly publish content on our Webull Learn resource site, where you can find the latest market updates, developer tools and tips, and more materials to help you develop with Webull. For more information, please click [here](https://www.webull.com/learn).

### Blog[​](#blog "Direct link to Blog")

Don't miss any updates—you can find the latest news from Webull on our blog. For more information, please click [here](https://www.webull.com/blog).

### Support[​](#support "Direct link to Support")

Have questions? Need help? Please check out our support page for FAQs and to get in touch with our team. For more information, please click [here](https://www.webull.com/help).

### Disclosure[​](#disclosure "Direct link to Disclosure")

To view our disclosure library, please click [here](https://www.webull.com/policy).

---

# URL: https://developer.webull.com/apis/docs/sdk

* SDKs and Tools

On this page

# SDKs and Tools

### Introduction[​](#introduction "Direct link to Introduction")

Webull offers professional clients Python and Java SDKs for in-depth, customized trading needs. It also provides two distinct web-based systems tailored to different client groups: the institutional Portal (exclusively for institutional clients) and the official website (for individual clients). The institutional Portal supports secure login for institutional users to view account funds, positions and orders. The official website, on the other hand, serves individual investors with standardized trading access, basic market information, and essential account services.

### SDK Installation[​](#sdk-installation "Direct link to SDK Installation")

* Python
* Java

Install via pip([Python](https://www.python.org/) version 3.8 through 3.11 is required)

```
pip3 install --upgrade webull-openapi-python-sdk
```

JDK 8 or above needs to be installed.

```
<dependency>  
    <groupId>com.webull.openapi</groupId>  
    <artifactId>webull-openapi-java-sdk</artifactId>  
    <version>1.0.3</version>  
</dependency>
```

## API Host[​](#api-host "Direct link to API Host")

Note

The HTTP API address is used for standard HTTP requests.

The trading message push address is used for real-time push notifications such as order status updates.

The market data message push address is used for real-time market data updates.

### Test Environment[​](#test-environment "Direct link to Test Environment")

```
HTTP API: us-openapi-alb.uat.webullbroker.com  
Trading message push: us-openapi-events.uat.webullbroker.com
```

### Production Environment[​](#production-environment "Direct link to Production Environment")

```
HTTP API: api.webull.com  
Trading message push: events-api.webull.com  
Market data message push: data-api.webull.com
```

## Calling the Test API[​](#calling-the-test-api "Direct link to Calling the Test API")

**How to obtain Test Environment App Key and App Secret:**

* Individual

You may use the test accounts provided in the [Test Accounts table](#test-accounts) for testing.

### Trade Request Example[​](#trade-request-example "Direct link to Trade Request Example")

* Python
* Java

```
import json  
import unittest  
import uuid  
from time import sleep  
  
from webull.core.client import ApiClient  
from webull.data.common.category import Category  
from webull.trade.trade_client import TradeClient  
  
# PRD env host: api.webull.com;   
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "<api_endpoint>"  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
account_id = "<your_account_id>"  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
  
    res = trade_client.account_v2.get_account_list()  
    if res.status_code == 200:  
        print("account_list=" + json.dumps(res.json(), indent=4))  
  
    res = trade_client.account_v2.get_account_balance(account_id)  
    if res.status_code == 200:  
        print("account_balance=" + json.dumps(res.json(), indent=4))  
  
    res = trade_client.account_v2.get_account_position(account_id)  
    if res.status_code == 200:  
        print("account_position=" + json.dumps(res.json(), indent=4))  
  
    preview_orders = {  
        "symbol": "AAPL",  
        "instrument_type": "EQUITY",  
        "market": "US",  
        "order_type": "MARKET",  
        "quantity": "1",  
        "support_trading_session": "N",  
        "side": "BUY",  
        "time_in_force": "DAY",  
        "entrust_type": "QTY"  
    }  
    res = trade_client.order_v2.preview_order(account_id=account_id, preview_orders=preview_orders)  
    if res.status_code == 200:  
        print("preview_res=" + json.dumps(res.json(), indent=4))  
  
    client_order_id = uuid.uuid4().hex  
    new_orders = {  
        "client_order_id": client_order_id,  
        "symbol": "AAPL",  
        "instrument_type": "EQUITY",  
        "market": "US",  
        "order_type": "LIMIT",  
        "limit_price": "188",  
        "quantity": "1",  
        "support_trading_session": "N",  
        "side": "BUY",  
        "time_in_force": "DAY",  
        "entrust_type": "QTY",  
    }  
  
    # This is an optional feature; you can still make a request without setting it.  
    custom_headers_map = {"category": Category.US_STOCK.name}  
    trade_client.order_v2.add_custom_headers(custom_headers_map)  
    res = trade_client.order_v2.place_order(account_id=account_id, new_orders=new_orders)  
    trade_client.order_v2.remove_custom_headers()  
    if res.status_code == 200:  
        print("place_order_res=" + json.dumps(res.json(), indent=4))  
    sleep(5)  
  
    modify_orders = {  
        "client_order_id": client_order_id,  
        "quantity": "100",  
        "limit_price": "200"  
    }  
    res = trade_client.order_v2.replace_order(account_id=account_id, modify_orders=modify_orders)  
    if res.status_code == 200:  
        print("replace_order_res=" + json.dumps(res.json(), indent=4))  
    sleep(5)  
  
    res = trade_client.order_v2.cancel_order_v2(account_id=account_id, client_order_id=client_order_id)  
    if res.status_code == 200:  
        print("cancel_order_res=" + json.dumps(res.json(), indent=4))  
  
    res = trade_client.order_v2.get_order_history_request(account_id=account_id)  
    if res.status_code == 200:  
        print("order_history_res=" + json.dumps(res.json(), indent=4))  
  
    # order detail  
    res = trade_client.order_v2.get_order_detail(account_id=account_id, client_order_id=client_order_id)  
    if res.status_code == 200:  
        print("order detail=" + json.dumps(res.json(), indent=4))  
  
    # Options  
    # For option order inquiries, please use the V2 query interface: api.order_v2.get_order_detail(account_id, client_order_id).  
    client_order_id = uuid.uuid4().hex  
    option_new_orders = [  
        {  
            "client_order_id": client_order_id,  
            "combo_type": "NORMAL",  
            "order_type": "LIMIT",  
            "quantity": "1",  
            "limit_price": "11.25",  
            "option_strategy": "SINGLE",  
            "side": "BUY",  
            "time_in_force": "GTC",  
            "entrust_type": "QTY",  
            "orders": [  
                {  
                    "side": "BUY",  
                    "quantity": "1",  
                    "symbol": "AAPL",  
                    "strike_price": "249.0",  
                    "init_exp_date": "2025-08-15",  
                    "instrument_type": "OPTION",  
                    "option_type": "CALL",  
                    "market": "US"  
                }  
            ]  
        }  
    ]  
    # preview  
    res = trade_client.order_v2.preview_option(account_id, option_new_orders)  
    if res.status_code == 200:  
        print("preview option=" + json.dumps(res.json(), indent=4))  
    sleep(5)  
    # place  
  
    # This is an optional feature; you can still make a request without setting it.  
    custom_headers_map = {"category": Category.US_OPTION.name}  
    trade_client.order_v2.add_custom_headers(custom_headers_map)  
    res = trade_client.order_v2.place_option(account_id, option_new_orders)  
    trade_client.order_v2.remove_custom_headers()  
    if res.status_code == 200:  
        print("place option=" + json.dumps(res.json(), indent=4))  
    sleep(5)  
  
    # replace  
    option_modify_orders = [  
        {  
            "client_order_id": client_order_id,  
            "quantity": "2",  
            "limit_price": "11.3",  
            "orders": [  
                {  
                    "client_order_id": client_order_id,  
                    "quantity": "2"  
                }  
            ]  
        }  
    ]  
    res = trade_client.order_v2.replace_option(account_id, option_modify_orders)  
    if res.status_code == 200:  
        print("replace option=" + json.dumps(res.json(), indent=4))  
    sleep(5)  
  
    # cancel  
    res = trade_client.order_v2.cancel_option(account_id, client_order_id)  
    if res.status_code == 200:  
        print("cancel option=" + json.dumps(res.json(), indent=4))
```

```
package com.webull.openapi;  
  
import com.webull.openapi.core.common.Region;  
import com.webull.openapi.core.common.dict.*;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.utils.GUID;  
import com.webull.openapi.trade.TradeClientV2;  
import com.webull.openapi.trade.request.v2.*;  
import com.webull.openapi.trade.response.v2.OrderHistory;  
import com.webull.openapi.trade.response.v2.TradeOrderResponse;  
  
import java.util.ArrayList;  
import java.util.List;  
  
public class OrderTradeClient {  
private static final Logger logger = LoggerFactory.getLogger(OrderTradeClient.class);  
  
    public static void main(String[] args) throws InterruptedException {  
        OrderTradeClient orderTradeClient = new OrderTradeClient();  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                //<your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId("us")                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com. Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
  
        TradeClientV2 apiService = new TradeClientV2(apiConfig);  
  
        // Use getAccountList interface to get account info  
        String accountId = "#{accountId}"; //<your_account_id> from by Account Api  
        String clientOrderId = GUID.get();  
        //stock  
        // build place order params  
        TradeOrder tradeOrder = orderTradeClient.buildPlaceStockParams(clientOrderId);  
        // place order  
        TradeOrderResponse placeOrderResp = apiService.placeOrder(accountId,tradeOrder);  
        logger.info("Place order response: {}", placeOrderResp);  
  
        // get order detail  
        OrderHistory orderDetail = apiService.getOrderDetails(accountId,clientOrderId);  
        logger.info("Order details response: {}", orderDetail);  
  
        Thread.sleep(2000);  
        // replace order  
        TradeOrder modifyTradeOrder = orderTradeClient.buildReplaceOrderParams(clientOrderId);  
        TradeOrderResponse modifyOrderResponse = apiService.replaceOrder(accountId, modifyTradeOrder);  
        logger.info("Order modify response: {}", modifyOrderResponse);  
  
        // query order detail after replace order  
        OrderHistory orderDetail1 = apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("Order orderDetail response after replace order: {}", orderDetail1);  
  
        // cancel order  
        TradeOrder cancelOrder = new TradeOrder();  
        cancelOrder.setClientOrderId(clientOrderId);  
        TradeOrderResponse cancelOrderResponse = apiService.cancelOrder(accountId, cancelOrder);  
        logger.info("Order cancel order response: {}", cancelOrderResponse);  
  
        // query order detail after cancel order  
        OrderHistory orderDetail2 = apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("Order orderDetail response after cancel: {}", orderDetail2.getOrders().get(0).getStatus());  
  
        //option  
        clientOrderId = GUID.get();  
        // build place option order params  
        OptionOrder optionOrder = orderTradeClient.buildOptionPlaceParams(clientOrderId);  
        TradeOrderResponse tradeOrderResponse = apiService.placeOption(accountId, optionOrder);  
        logger.info("Place option order response: {}", tradeOrderResponse);  
  
        // get option order detail  
        OrderHistory orderDetails = apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("Order details response: {}", orderDetails);  
  
        OptionOrder replaceOptionOrder = orderTradeClient.buildReplaceOptionPlaceParams(clientOrderId);  
        TradeOrderResponse replaceResponse = apiService.replaceOption(accountId, replaceOptionOrder);  
        logger.info("Replace option order response: {}", replaceResponse);  
  
        // get option order detail  
        OrderHistory orderDetails2= apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("Order details response: {}", orderDetails2);  
  
        // cancel order  
        OptionOrder cancelOption = new OptionOrder();  
        cancelOption.setClientOrderId(clientOrderId);  
        TradeOrderResponse orderResponse = apiService.cancelOption(accountId, cancelOption);  
        logger.info("Option order cancel response: {}", orderResponse);  
    }  
  
    /**  
     * build your place order object  
     *  
     * @param clientOrderId  
     * @return  
     */  
    private TradeOrder buildPlaceStockParams(String clientOrderId) {  
        TradeOrder tradeOrder = new TradeOrder();  
        List<TradeOrderItem> newOrders = new ArrayList<>();  
        TradeOrderItem placeOne = new TradeOrderItem();  
        placeOne.setClientOrderId(clientOrderId);  
        // WebullUS need set combo_type, because WebullUS support combo order  
        placeOne.setComboType(ComboType.NORMAL.name());  
        newOrders.add(placeOne);  
        placeOne.setSymbol("AAPL");  
        placeOne.setInstrumentType(InstrumentSuperType.EQUITY.name());  
        placeOne.setMarket(Region.us.name().toUpperCase());  
        placeOne.setOrderType(OrderType.LIMIT.name());  
        placeOne.setQuantity("1");  
        placeOne.setLimitPrice("100");  
        placeOne.setSupportTradingSession("Y");  
        placeOne.setSide(OrderSide.BUY.name());  
        placeOne.setTimeInForce(OrderTIF.DAY.name());  
        placeOne.setEntrustType(EntrustType.QTY.name());  
        tradeOrder.setNewOrders(newOrders);  
        return tradeOrder;  
    }  
  
    /**  
     * build your replace order params  
     * @param clientOrderId  
     * @return replace order object  
     */  
    private TradeOrder buildReplaceOrderParams(String clientOrderId) {  
        TradeOrder replaceTradeOrder = new TradeOrder();  
        List<TradeOrderItem> modifyOrders = new ArrayList<>();  
        TradeOrderItem modifyOne = new TradeOrderItem();  
        modifyOne.setClientOrderId(clientOrderId);  
        modifyOne.setLimitPrice("25");  
        modifyOne.setQuantity("2");  
        modifyOrders.add(modifyOne);  
        replaceTradeOrder.setModifyOrders(modifyOrders);  
        return replaceTradeOrder;  
    }  
  
    /**  
     * build your option stock place params  
     * @param clientOrderId  
     * @return option order place params  
     */  
    private OptionOrder buildOptionPlaceParams(String clientOrderId) {  
        // Options  
        OptionOrderItemLeg optionOrderItemLeg = new OptionOrderItemLeg();  
        optionOrderItemLeg.setSide(OrderSide.BUY.name());  
        optionOrderItemLeg.setQuantity("10");  
        optionOrderItemLeg.setSymbol("AAPL");  
        optionOrderItemLeg.setStrikePrice("280");  
        optionOrderItemLeg.setOptionExpireDate("2025-12-19");  
        optionOrderItemLeg.setInstrumentType(InstrumentSuperType.OPTION.name());  
        optionOrderItemLeg.setOptionType(OptionType.CALL.name());  
        optionOrderItemLeg.setMarket(Markets.US.name());  
        List<OptionOrderItemLeg> optionOrderItemLegList = new ArrayList<>();  
        optionOrderItemLegList.add(optionOrderItemLeg);  
  
        OptionOrderItem optionOrderItem = new OptionOrderItem();  
        optionOrderItem.setClientOrderId(clientOrderId);  
        optionOrderItem.setComboType(ComboType.NORMAL.name());  
        optionOrderItem.setOptionStrategy(OptionStrategy.SINGLE.name());  
        optionOrderItem.setSide(OrderSide.BUY.name());  
        optionOrderItem.setOrderType(OrderType.LIMIT.name());  
        optionOrderItem.setTimeInForce(OrderTIF.GTC.name());  
        optionOrderItem.setLimitPrice("20.5");  
        optionOrderItem.setQuantity("1");  
        optionOrderItem.setEntrustType(EntrustType.QTY.name());  
        optionOrderItem.setLegs(optionOrderItemLegList);  
        List<OptionOrderItem> optionOrderItemList = new ArrayList<>();  
        optionOrderItemList.add(optionOrderItem);  
        OptionOrder optionOrder = new OptionOrder();  
        optionOrder.setNewOrders(optionOrderItemList);  
        return optionOrder;  
    }  
  
    /**  
     * build your option stock place params  
     * @param clientOrderId  
     * @return option order place params  
     */  
    private OptionOrder buildReplaceOptionPlaceParams(String clientOrderId) {  
        OptionOrder replaceOptionOrder = new OptionOrder();  
        replaceOptionOrder.setClientOrderId(clientOrderId);  
        List<OptionOrderItem> modifyOrders = new ArrayList<>();  
        replaceOptionOrder.setModifyOrders(modifyOrders);  
        OptionOrderItem optionOrderItem = new OptionOrderItem();  
        modifyOrders.add(optionOrderItem);  
        optionOrderItem.setClientOrderId(clientOrderId);  
        optionOrderItem.setQuantity("2");  
        return replaceOptionOrder;  
    }  
}
```

### Market Data Example(Http)[​](#market-data-examplehttp "Direct link to Market Data Example(Http)")

* Python
* Java

```
from webull.data.common.category import Category  
from webull.data.common.timespan import Timespan  
from webull.core.client import ApiClient  
from webull.data.data_client import DataClient  
  
# PRD env host: api.webull.com;   
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "<api_endpoint>"  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
if __name__ == '__main__':  
    data_client = DataClient(api_client)  
  
    trading_sessions = ["PRE", "RTH", "ATH", "OVN"]  
    res = data_client.instrument.get_instrument("AAPL", Category.US_STOCK.name)  
    if res.status_code == 200:  
        print('get_instrument:', res.json())  
  
    res = data_client.market_data.get_snapshot('AAPL', Category.US_STOCK.name, extend_hour_required=True, overnight_required=True)  
    if res.status_code == 200:  
        print('get_snapshot:', res.json())  
  
    res = data_client.market_data.get_history_bar('AAPL', Category.US_STOCK.name, Timespan.M1.name)  
    if res.status_code == 200:  
        print('get_history_bar:', res.json())  
  
    res = data_client.market_data.get_batch_history_bar(['AAPL', 'TSLA'], Category.US_STOCK.name, Timespan.M1.name, 1)  
    if res.status_code == 200:  
        print('get_batch_history_bar:', res.json())  
  
    res = data_client.market_data.get_tick("AAPL", Category.US_STOCK.name, trading_sessions=trading_sessions)  
    if res.status_code == 200:  
        print('get_tick:', res.json())  
  
    res = data_client.market_data.get_quotes("AAPL", Category.US_STOCK.name, depth=1, overnight_required=True)  
    if res.status_code == 200:  
        print('get_quotes:', res.json())
```

```
package com.webull.openapi;  
  
import com.webull.openapi.core.common.Region;  
import com.webull.openapi.core.common.dict.Category;  
import com.webull.openapi.core.common.dict.Timespan;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.data.DataClient;  
import com.webull.openapi.data.quotes.domain.*;  
  
import java.util.ArrayList;  
import java.util.HashSet;  
import java.util.List;  
import java.util.Set;  
  
public class MarketDataHttpDemo {  
  
    private static final Logger logger = LoggerFactory.getLogger(OrderTradeClient.class);  
  
    public static void main(String[] args) {  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                //<your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId("us")                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com. Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
  
        DataClient dataClient = new DataClient(apiConfig);  
        Set<String> symbols = new HashSet<>();  
        symbols.add("AAPL");  
        symbols.add("TSLA");  
        // instrument  
        List<Instrument>  instruments = dataClient.getInstruments(symbols, Category.US_STOCK.name());  
        logger.info("GetInstruments response: {}", instruments);  
        //snapshot  
        List<Snapshot>  snapshots = dataClient.getSnapshots(symbols, Category.US_STOCK.name(), true, true);  
        logger.info("GetSnapshots response: {}", snapshots);  
        //history bar  
        List<Bar> bars = dataClient.getBars("AAPL", Category.US_STOCK.name(), Timespan.M5.name(),10);  
        logger.info("GetBars response: {}", bars);  
        //batch history bars  
        BatchBarResponse batchBarResponse = dataClient.getBatchBars(new ArrayList<>(symbols), Category.US_STOCK.name(), Timespan.M5.name(),10);  
        logger.info("GetBatchBars response: {}", batchBarResponse);  
        // get tick  
        Tick tick = dataClient.getTicks("AAPL", Category.US_STOCK.name());  
        logger.info("GetTicks response: {}", tick);  
        //get quote  
        Quote quote = dataClient.getQuote("AAPL",  Category.US_STOCK.name(), "1", true);  
        logger.info("GetQuote response: {}", quote);  
  
    }  
}
```

### Market Data Example(mqtt sync)[​](#market-data-examplemqtt-sync "Direct link to Market Data Example(mqtt sync)")

* Python
* Java

```
import logging  
import uuid  
from logging.handlers import TimedRotatingFileHandler  
  
from webull.data.common.category import Category  
from webull.data.common.subscribe_type import SubscribeType  
from webull.data.data_streaming_client import DataStreamingClient  
  
your_app_key = "</your_app_key>"  
your_app_secret = "</your_app_secret>"  
  
# PRD env host: api.webull.com;   
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "</optional_quotes_endpoint>"  
  
# PRD env host: data-api.webull.com  
optional_quotes_endpoint = "</optional_quotes_endpoint>"  
region_id = 'us'  
  
session_id = uuid.uuid4().hex  
data_streaming_client = DataStreamingClient(your_app_key, your_app_secret, region_id, session_id,  
                                    http_host=optional_api_endpoint,  
                                    mqtt_host=optional_quotes_endpoint)  
  
if __name__ == '__main__':  
    def my_connect_success_func(client, api_client, quotes_session_id):  
        print("connect success with session_id:%s" % quotes_session_id)  
        # subscribe  
        symbols = ['AAPL']  
        sub_types = [SubscribeType.QUOTE.name, SubscribeType.SNAPSHOT.name, SubscribeType.TICK.name]  
        client.subscribe( symbols, Category.US_STOCK.name, sub_types)  
  
    def my_quotes_message_func(client, topic, quotes):  
        print("receive message: topic:%s, quotes:%s" % (topic, quotes))  
  
    def my_subscribe_success_func(client, api_client, quotes_session_id):  
        print("subscribe success with session_id:%s" % quotes_session_id)  
  
    # set connect success callback func  
    data_streaming_client.on_connect_success = my_connect_success_func  
    # set quotes receiving callback func  
    data_streaming_client.on_quotes_message = my_quotes_message_func  
    # set subscribe success callback func  
    data_streaming_client.on_subscribe_success = my_subscribe_success_func  
    # the sync mode, blocking in current thread  
    data_streaming_client.connect_and_loop_forever()
```

```
package com.webull.openapi;  
  
import com.webull.openapi.core.common.Region;  
import com.webull.openapi.core.common.dict.Category;  
import com.webull.openapi.core.common.dict.SubscribeType;  
import com.webull.openapi.core.execption.ClientException;  
import com.webull.openapi.core.execption.ServerException;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.serialize.JsonSerializer;  
import com.webull.openapi.core.utils.GUID;  
import com.webull.openapi.data.quotes.subsribe.IDataStreamingClient;  
import com.webull.openapi.data.quotes.subsribe.message.MarketData;  
  
import java.util.HashSet;  
import java.util.Set;  
  
public class MarketDataMqttSyncDemo {  
  
    private static final Logger logger = LoggerFactory.getLogger(MarketDataMqttSyncDemo.class);  
  
  
    private static final String APP_KEY = "<your_app_key>";  
    private static final String APP_SECRET = "<your_app_secret>";  
    // PRD env host: data-api.webull.com  
    private static final String DATA_API_HOST = "<webull_api_host>";  
    // PRD env host: api.webull.com   
    // Test env host: us-openapi-alb.uat.webullbroker.com  
    private static final String HTTP_API_HOST = "<webull_data_host>";  
  
    public static void main(String[] args) {  
        Set<String> symbols = new HashSet<>();  
        symbols.add("AAPL");  
  
        Set<String> subTypes = new HashSet<>();  
        subTypes.add(SubscribeType.SNAPSHOT.name());  
        subTypes.add(SubscribeType.QUOTE.name());  
        subTypes.add(SubscribeType.TICK.name());  
  
        try (IDataStreamingClient client = IDataStreamingClient.builder()  
                .appKey(APP_KEY)  
                .appSecret(APP_SECRET)  
                .sessionId(GUID.get())  
                .regionId(Region.us.name())  
                .http_host(HTTP_API_HOST)  
                .mqtt_host(DATA_API_HOST)  
                .onMessage(MarketDataMqttSyncDemo::handleMarketData)  
                .addSubscription(symbols, Category.US_STOCK.name(), subTypes, "1", false)  
                .build()) {  
  
            // subscribe blocking.  
            subscribeBlocking(client);  
  
        } catch (ClientException ex) {  
            logger.error("Client error", ex);  
        } catch (ServerException ex) {  
            logger.error("Sever error", ex);  
        } catch (Exception ex) {  
            logger.error("Unknown error", ex);  
        }  
    }  
  
    private static void handleMarketData(MarketData marketData) {  
        // your code...  
        logger.info("Received market data: {}", JsonSerializer.toJson(marketData));  
    }  
  
  
    private static void subscribeBlocking(IDataStreamingClient client) {  
        client.connectBlocking();  
        logger.info("Connect completed.");  
        client.subscribeBlocking();  
        logger.info("Subscribe completed.");  
    }  
  
}
```

### Market Data Example(mqtt async)[​](#market-data-examplemqtt-async "Direct link to Market Data Example(mqtt async)")

* Python
* Java

```
import time  
import uuid  
  
from webull.data.common.category import Category  
from webull.data.common.subscribe_type import SubscribeType  
from webull.data.data_streaming_client import DataStreamingClient  
  
  
your_app_key = "</your_app_key>"  
your_app_secret = "</your_app_secret>"  
  
# PRD env host: api.webull.com;   
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "</optional_quotes_endpoint>"  
  
# PRD env host: data-api.webull.com  
optional_quotes_endpoint = "</optional_quotes_endpoint>"  
region_id = 'us'  
  
session_id = uuid.uuid4().hex  
data_streaming_client = DataStreamingClient(your_app_key, your_app_secret, region_id, session_id,  
                                    http_host=optional_api_endpoint,  
                                    mqtt_host=optional_quotes_endpoint)  
  
if __name__ == '__main__':  
    def my_connect_success_func(client, api_client, quotes_session_id):  
        print("connect success with session_id:%s" % quotes_session_id)  
        # subscribe  
        symbols = ['AAPL']  
        sub_types = [SubscribeType.QUOTE.name, SubscribeType.SNAPSHOT.name, SubscribeType.TICK.name]  
        client.subscribe(symbols, Category.US_STOCK.name, sub_types)  
  
  
    def my_quotes_message_func(client, topic, quotes):  
        print("receive message: topic:%s, quotes:%s" % (topic, quotes))  
  
  
    def my_subscribe_success_func(client, api_client, quotes_session_id):  
        print("subscribe success with session_id:%s" % quotes_session_id)  
  
  
    # set connect success callback func  
    data_streaming_client.on_connect_success = my_connect_success_func  
    # set quotes receiving callback func  
    data_streaming_client.on_quotes_message = my_quotes_message_func  
    # set subscribe success callback func  
    data_streaming_client.on_subscribe_success = my_subscribe_success_func  
  
    # the async mode, processing in another thread  
    data_streaming_client.connect_and_loop_start()  
  
    ticker = 60  
    print("will remove subscription after %s seconds..." % ticker)  
    time.sleep(ticker)  
  
    subscribe_success = data_streaming_client.get_subscribe_success()  
    quotes_session_id = data_streaming_client.get_session_id()  
    if subscribe_success:  
        print("start remove subscription...")  
        data_streaming_client.unsubscribe(unsubscribe_all=True)  
        print("remove subscription finish")  
    else:  
        print("Do not remove subscription, subscribe_success:%s", subscribe_success)  
  
    start_time = time.time()  
    wait_time = 1  
    while True:  
        elapsed = int(time.time() - start_time)  
        if elapsed >= ticker:  
            print("Wait completed, start subscribing...")  
            break  
        print("Waiting {} seconds before subscription... (elapsed {}s / {}s)".format(wait_time, elapsed, ticker))  
        time.sleep(wait_time)  
  
    # subscribe  
    connect_success = data_streaming_client.get_connect_success()  
    if connect_success:  
        symbols = ['AAPL']  
        sub_types = [SubscribeType.QUOTE.name, SubscribeType.SNAPSHOT.name, SubscribeType.TICK.name]  
        data_streaming_client.subscribe(symbols, Category.US_STOCK.name, sub_types)  
        print("add subscription...")  
    else:  
        print("Do not add subscription, connect_success:%s", connect_success)  
  
    print("will stop processing after %s seconds" % ticker)  
    time.sleep(ticker)  
    data_streaming_client.loop_stop()  
    print("processing done")
```

```
package com.webull.openapi.demo;  
  
import com.webull.openapi.core.common.Region;  
import com.webull.openapi.core.common.dict.Category;  
import com.webull.openapi.core.common.dict.SubscribeType;  
import com.webull.openapi.core.execption.ClientException;  
import com.webull.openapi.core.execption.ServerException;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.serialize.JsonSerializer;  
import com.webull.openapi.core.utils.GUID;  
import com.webull.openapi.data.quotes.subsribe.IDataStreamingClient;  
import com.webull.openapi.data.quotes.subsribe.message.MarketData;  
  
import java.util.HashSet;  
import java.util.Set;  
  
public class MarketDataMqttAsyncDemo {  
  
    private static final Logger logger = LoggerFactory.getLogger(MarketDataMqttAsyncDemo.class);  
  
  
    private static final String APP_KEY = "<your_app_key>";  
    private static final String APP_SECRET = "<your_app_secret>";  
    // PRD env host: data-api.webull.com  
    private static final String DATA_API_HOST = "<webull_api_host>";  
    // PRD env host: api.webull.com   
    // Test env host: us-openapi-alb.uat.webullbroker.com  
    private static final String HTTP_API_HOST = "<webull_data_host>";  
  
    public static void main(String[] args) {  
  
        Set<String> symbols = new HashSet<>();  
        symbols.add("AAPL");  
  
        Set<String> subTypes = new HashSet<>();  
        subTypes.add(SubscribeType.SNAPSHOT.name());  
        subTypes.add(SubscribeType.QUOTE.name());  
        subTypes.add(SubscribeType.TICK.name());  
  
        String category = Category.US_STOCK.name();  
        String depth = "1";  
        boolean overnightRequired = false;  
  
  
        try (IDataStreamingClient client = IDataStreamingClient.builder()  
                .appKey(APP_KEY)  
                .appSecret(APP_SECRET)  
                .sessionId(GUID.get())  
                .regionId(Region.us.name())  
                .http_host(HTTP_API_HOST)  
                .mqtt_host(DATA_API_HOST)  
                .onMessage(MarketDataMqttAsyncDemo::handleMarketData)  
                .addSubscription(symbols, category, subTypes, depth, overnightRequired)  
                .build()) {  
  
            // connect  
            client.connectBlocking();  
  
            // subscribe asynchronously.  
            client.subscribeAsync();  
  
            // waiting to unsubscribe  
            long ticker = 30;  
            int waitTime = 1;  
            long startTime = System.currentTimeMillis();  
            while (true) {  
                long elapsed = (System.currentTimeMillis() - startTime) / 1000;  
                if (elapsed >= ticker) {  
                    logger.info("Wait completed, start remove subscription...");  
                    break;  
                }  
                logger.info("Waiting {} seconds before remove subscription... (elapsed {}s / {}s)", waitTime, elapsed, ticker);  
                Thread.sleep(waitTime * 1000L);  
            }  
            client.removeSubscriptionAsync(symbols, category, subTypes);  
            logger.info("Asynchronous call to cancel subscription succeeded.");  
  
  
            // waiting to subscribe  
            startTime = System.currentTimeMillis();  
            while (true) {  
                long elapsed = (System.currentTimeMillis() - startTime) / 1000;  
                if (elapsed >= ticker) {  
                    logger.info("Wait completed, start subscribing...");  
                    break;  
                }  
                logger.info("Waiting {} seconds before subscription... (elapsed {}s / {}s)", waitTime, elapsed, ticker);  
                Thread.sleep(waitTime * 1000L);  
            }  
            client.addSubscriptionAsync(symbols, category, subTypes, depth, overnightRequired);  
            logger.info("Asynchronous call to subscribe succeeded.");  
  
  
            // waiting to disconnect  
            startTime = System.currentTimeMillis();  
            while (true) {  
                long elapsed = (System.currentTimeMillis() - startTime) / 1000;  
                if (elapsed >= ticker) {  
                    logger.info("Wait completed, start disconnect...");  
                    break;  
                }  
                logger.info("Waiting {} seconds before disconnect... (elapsed {}s / {}s)", waitTime, elapsed, ticker);  
                Thread.sleep(waitTime * 1000L);  
            }  
            client.disconnectAsync();  
            logger.info("Asynchronous call to disconnect succeeded.");  
  
        } catch (ClientException ex) {  
            logger.error("Client error", ex);  
        } catch (ServerException ex) {  
            logger.error("Sever error", ex);  
        } catch (Exception ex) {  
            logger.error("Unknown error", ex);  
        }  
    }  
  
    private static void handleMarketData(MarketData marketData) {  
        // your code...  
        logger.info("Received market data: {}", JsonSerializer.toJson(marketData));  
    }  
}
```

## Test Accounts[​](#test-accounts "Direct link to Test Accounts")

The following information are for Trading API & Market Data API integration. You will no need to apply account seperately in test environment.

Note: since these accounts are shared publically, the orders and positions on the account may change. If you do need a seperate account for your testing, please reach out to our support team.

| No. | Test Account ID | Test App Key | Test Secret Key |
| --- | --- | --- | --- |
| 1 | J6HA4EBQRQFJD2J6NQH0F7M649 | a88f2efed4dca02b9bc1a3cecbc35dba | c2895b3526cc7c7588758351ddf425d6 |
| 2 | HBGQE8NM0CQG4Q34ABOM83HD09 | 6d9f1a0aa919a127697b567bb704369e | adb8931f708ea3d57ec1486f10abf58c |
| 3 | 4BJITU00JUIVEDO5V3PRA5C5G8 | eecbf4489f460ad2f7aecef37b267618 | 8abf920a9cc3cb7af3ea5e9e03850692 |

## Feedback and Communication[​](#feedback-and-communication "Direct link to Feedback and Communication")

1. You can contact our staff via the Webull API service email address: [api-support@webull-us.com](mailto:api-support@webull-us.com)

---

# URL: https://developer.webull.com/apis/docs/trade-api/account

* Trading API
* Accounts

On this page

# Accounts

Webull's Account API allows developers to query account information via the HTTP protocol.
For details, please refer to the [API Reference](/apis/docs/reference/account).

Before calling the Account API, you need to have an App Key and Secret. For details, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

## 1. Base URLs[​](#1-base-urls "Direct link to 1. Base URLs")

* **Production Environment**: `https://api.webull.com/`
* **Test Environment**: `http://us-openapi-alb.uat.webullbroker.com/`

## 2. Code Example[​](#2-code-example "Direct link to 2. Code Example")

* Python
* Java

```
from webull.core.client import ApiClient  
from webull.trade.trade_client import TradeClient  
  
optional_api_endpoint = "<webull_api_host>" # PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
  
    res = trade_client.account_v2.get_account_list()  
    if res.status_code == 200:  
        print('get account list:', res.json())
```

```
public class AccountList {  
    private static final Logger logger = LoggerFactory.getLogger(AccountList.class);  
  
    public static void main(String[] args) throws InterruptedException {  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                // <your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId("us")                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
          
        com.webull.openapi.trade.TradeClientV2 apiService = new com.webull.openapi.trade.TradeClientV2(apiConfig);  
  
        // get account list  
        List<Account> accounts = apiService.listAccount();  
        logger.info("Accounts: {}", accounts);  
    }  
}
```

---

# URL: https://developer.webull.com/apis/docs/trade-api/asset

* Trading API
* Assets

On this page

# Assets

Webull's Assets API enables developers to retrieve asset information over HTTP.
For details, please refer to the [API Reference](/apis/docs/reference/assets).

Before calling the Assets API, you need to have an App Key and Secret. For details, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

## 1. Base URLs[​](#1-base-urls "Direct link to 1. Base URLs")

* **Production Environment**: `https://api.webull.com/`
* **Test Environment**: `http://us-openapi-alb.uat.webullbroker.com/`

## 2. Code Example[​](#2-code-example "Direct link to 2. Code Example")

* Python
* Java

```
from webull.core.client import ApiClient  
from webull.trade.trade_client import TradeClient  
  
optional_api_endpoint = "<webull_api_host>" # PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
account_id = "<your_account_id>" # Use account_list interface to get account info  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
  
    res = trade_client.account_v2.get_account_balance("account_id")  
    if res.status_code == 200:  
        print('get account balance info:', res.json())  
  
    res = trade_client.account_v2.get_account_position("account_id")  
    if res.status_code == 200:  
        print('get account positions info:', res.json())
```

```
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.samples.account.AccountList;  
import com.webull.openapi.samples.config.Env;  
import com.webull.openapi.trade.response.v2.AccountBalanceInfo;  
import com.webull.openapi.trade.response.v2.AccountPositionsInfo;  
  
import java.util.List;  
  
public class AssetsClient {  
    private static final Logger logger = LoggerFactory.getLogger(AssetsClient.class);  
  
    public static void main(String[] args) throws InterruptedException {  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                //<your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId("us")                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
        com.webull.openapi.trade.TradeClientV2 apiService = new com.webull.openapi.trade.TradeClientV2(apiConfig);  
  
        // Use getAccountList interface to get account info  
        String accountId = "#{accountId}";   
        // get account balance information  
        AccountBalanceInfo balanceInfo = apiService.balanceAccount(accountId);  
        logger.info("BalanceInfo: {}", balanceInfo);  
  
        List<AccountPositionsInfo> positionsInfos = apiService.positionsAccount(accountId);  
        logger.info("PositionsInfos: {}", positionsInfos);  
  
    }  
  
}
```

---

# URL: https://developer.webull.com/apis/docs/trade-api/crypto

* Trading API
* Crypto Trading

On this page

# Crypto Trading

Webull’s Crypto API enables developers to trade and query over HTTP.
For more details, please refer to the [API Reference](/apis/docs/reference/trading).

Before calling the Crypto API, you need to have an `App Key` and `secret`. For more information, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

## Base URLs[​](#base-urls "Direct link to Base URLs")

* **Production Environment**: `https://api.webull.com/`
* **Test Environment**: `http://us-openapi-alb.uat.webullbroker.com/`

## Open Crypto Account[​](#open-crypto-account "Direct link to Open Crypto Account")

Crypto trading requires opening a crypto account, you can refer to the following steps

1. Open Webull official website to download [`Webull APP`](https://www.webull.com/trading-platforms/mobile-app)
2. Log in to the `Webull APP`,Click sequentially on `Menu` -> `More`
3. Click `Crypto` in the trading tab
4. Click `Open Account`，follow the App instructions to complete Crypto account opening

![Example banner](/apis/assets/images/opening_crypto_account0-8a61ef2f4373e81488c9afb6711721aa.png)
![Example banner](/apis/assets/images/opening_crypto_account1-c253fdde872600dd68086ff14f6aaf9e.png)
![Example banner](/apis/assets/images/opening_crypto_account2-56f95eaff2963e5ad9511a476a882a9e.png)

## Supported Coins[​](#supported-coins "Direct link to Supported Coins")

Webull OpenAPI supports over 70 unique crypto assets, and more are on the way.

To retrieve all available crypto assets and their trading pairs, please use the API call below

* Python
* Java

```
from webull.data.common.category import Category  
from webull.data.common.contract_type import ContractType  
from webull.data.common.timespan import Timespan  
from webull.core.client import ApiClient  
from webull.data.data_client import DataClient  
  
optional_api_endpoint = "<api_endpoint>"  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "<region_id>"  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
if __name__ == '__main__':  
    data_client = DataClient(api_client)  
    res = data_client.instrument.get_crypto_instrument(status='OC')  
    if res.status_code == 200:  
        print('get_crypto_instrument:', res.json())
```

```
package com.webull.openapi;  
  
import com.webull.openapi.core.common.Region;  
import com.webull.openapi.core.common.dict.Category;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.data.quotes.api.IDataClient;  
import com.webull.openapi.data.quotes.domain.CryptoInstrumentDetail;  
import com.webull.openapi.data.quotes.domain.InstrumentQueryParam;  
  
import java.util.List;  
  
public class DataClientDemo {  
  
    private static final Logger logger = LoggerFactory.getLogger(DataClientDemo.class);  
  
    public static void main(String[] args) {  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                //<your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId(Region.us.name())                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
        IDataClient dataClient = new com.webull.openapi.data.DataClient(apiConfig);  
        InstrumentQueryParam param = new InstrumentQueryParam();  
        param.setCategory(Category.US_CRYPTO.name());  
        param.setStatus("OC");  
        List<CryptoInstrumentDetail> instruments = dataClient.getCryptoInstrument(param);  
        logger.info("Crypto Instrument Response: {}", instruments);  
    }  
}
```

## Supported Orders[​](#supported-orders "Direct link to Supported Orders")

When placing crypto orders via the Orders API.
`MARKET`, `LIMIT`, and `STOP LOSS LIMIT` orders are supported. The accepted `time_in_force` values are `DAY`,`GTC` and `IOC`.

You can submit crypto orders for any supported crypto pair via API, see the below request example.

* Python
* Java

```
import uuid  
from time import sleep  
  
from webull.core.client import ApiClient  
from webull.trade.trade_client import TradeClient  
  
optional_api_endpoint = "<webull_api_host>" # PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
account_id = "<your_account_id>" # Use account_list interface to get account info  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
  
    # normal crypto order  
    normal_crypto_client_order_id = uuid.uuid4().hex  
    print('normal crypto client order id:', normal_crypto_client_order_id)  
    new_normal_crypto_orders = [  
        {  
            "combo_type": "NORMAL",  
            "client_order_id": normal_crypto_client_order_id,  
            "symbol": "BTCUSD",  
            "instrument_type": "CRYPTO",  
            "market": "US",  
            "order_type": "LIMIT",  
            "limit_price": "80000",  
            "quantity": "0.003",  
            "side": "BUY",  
            "time_in_force": "DAY",  
            "entrust_type": "QTY"  
        }  
    ]  
  
    res = trade_client.order_v3.place_order(account_id, new_normal_crypto_orders)  
    if res.status_code == 200:  
        print('place normal crypto order res:', res.json())  
    sleep(3)  
  
    res = trade_client.order_v3.cancel_order(account_id, normal_crypto_client_order_id)  
    if res.status_code == 200:  
        print('cancel normal crypto order res:', res.json())  
  
    res = trade_client.order_v3.get_order_detail(account_id, normal_crypto_client_order_id)  
    if res.status_code == 200:  
        print('get normal crypto order detail res:', res.json())
```

```
import com.webull.openapi.core.common.dict.ComboType;  
import com.webull.openapi.core.common.dict.EntrustType;  
import com.webull.openapi.core.common.dict.InstrumentSuperType;  
import com.webull.openapi.core.common.dict.Markets;  
import com.webull.openapi.core.common.dict.OrderSide;  
import com.webull.openapi.core.common.dict.OrderTIF;  
import com.webull.openapi.core.common.dict.OrderType;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.utils.GUID;  
import com.webull.openapi.trade.TradeClientV3;  
import com.webull.openapi.trade.request.v3.TradeOrder;  
import com.webull.openapi.trade.request.v3.TradeOrderItem;  
import com.webull.openapi.trade.response.v3.OrderHistory;  
import com.webull.openapi.trade.response.v3.TradeOrderResponse;  
  
import java.util.ArrayList;  
import java.util.List;  
  
public class OrderCryptoTradeClient {  
    private static final Logger logger = LoggerFactory.getLogger(OrderCryptoTradeClient.class);  
  
    public static void main(String[] args) throws InterruptedException {  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                //<your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId("us")                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
        TradeClientV3 apiService = new TradeClientV3(apiConfig);  
  
        // Use getAccountList interface to get account info  
        String accountId = "#{accountId}"; //<your_account_id> from by Account Api  
        String clientOrderId = GUID.get();  
        logger.info("normal crypto client order id : {}", clientOrderId);  
  
        // Normal Crypto Example  
        TradeOrder newNormalCryptoOrder = new TradeOrder();  
        List<TradeOrderItem> newNormalCryptoOrders = new ArrayList<>();  
  
        TradeOrderItem normalCryptoOrder = new TradeOrderItem();  
        newNormalCryptoOrders.add(normalCryptoOrder);  
        normalCryptoOrder.setClientOrderId(clientOrderId);  
        normalCryptoOrder.setComboType(ComboType.NORMAL.name());  
        normalCryptoOrder.setSymbol("BTCUSD");  
        normalCryptoOrder.setInstrumentType(InstrumentSuperType.CRYPTO.name());  
        normalCryptoOrder.setMarket(Markets.US.name());  
        normalCryptoOrder.setOrderType(OrderType.LIMIT.name());  
        normalCryptoOrder.setQuantity("0.003");  
        normalCryptoOrder.setLimitPrice("80000");  
        normalCryptoOrder.setSide(OrderSide.BUY.name());  
        normalCryptoOrder.setTimeInForce(OrderTIF.DAY.name());  
        normalCryptoOrder.setEntrustType(EntrustType.QTY.name());  
        newNormalCryptoOrder.setNewOrders(newNormalCryptoOrders);  
  
        TradeOrderResponse placeNormalCryptoResponse = apiService.placeOrder(accountId, newNormalCryptoOrder);  
        logger.info("Place normal crypto response: {}", placeNormalCryptoResponse);  
        Thread.sleep(3 * 1000L);  
  
        TradeOrder cancelNormalCryptoOrder = new TradeOrder();  
        cancelNormalCryptoOrder.setClientOrderId(clientOrderId);  
        TradeOrderResponse cancelNormalCryptoResponse = apiService.cancelOrder(accountId, cancelNormalCryptoOrder);  
        logger.info("cancel normal crypto: {}", cancelNormalCryptoResponse);  
  
        OrderHistory orderDetail = apiService.getOrderDetails(accountId, normalCryptoOrder.getClientOrderId());  
        logger.info("Order details: {}", orderDetail);  
    }  
}
```

The above request example submits a market order via API to buy 0.0001 BTC with USD (BTC/USD pair) that is good till end of day.

## Trading Hours[​](#trading-hours "Direct link to Trading Hours")

Crypto trading is available 24/7, and your orders will be executed at any time during the day.

## Trading Limits[​](#trading-limits "Direct link to Trading Limits")

Trading limits vary based on your location and crypto service provider.

**For customers outside of New York, Guam, and the Northern Mariana Islands:**

* Maximum per trade: $100,000
* Maximum total of pending buy orders: $200,000
* Minimum order amount: $2.00
* Smallest tradable amount: 0.00000001

**For customers in New York, Guam, and the Northern Mariana Islands:**

* Maximum per trade: $100,000
* Maximum total of pending buy orders: $200,000
* Minimum order amount: $1.00
* Smallest tradable amount: 0.00000001

note

Note that when selling crypto, your position must not fall below $2 after placing the order.

## Crypto Market Data[​](#crypto-market-data "Direct link to Crypto Market Data")

Webull's Crypto Market Data API offers free market data access over HTTP
For more details, please refer to the [API Reference](/apis/docs/reference/crypto-market-data).

## Crypto Spot Trading Fees[​](#crypto-spot-trading-fees "Direct link to Crypto Spot Trading Fees")

Please refer to the [Webull's fee Schedule](https://www.webull.com/pricing#top)

---

# URL: https://developer.webull.com/apis/docs/trade-api/event-contract

* Trading API
* Event Trading

On this page

# Event Trading

Webull's Event Trading API enables developers to trade and query over HTTP. For more details, please refer to the [Trading API Reference](/apis/docs/reference/trading).

Before calling the Trading API, you need to have an `App Key` and `secret`. For more information, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

## Base URLs[​](#base-urls "Direct link to Base URLs")

* **Production Environment**: `https://api.webull.com/`
* **Test Environment**: `http://us-openapi-alb.uat.webullbroker.com/`

## Supported Event Markets[​](#supported-event-markets "Direct link to Supported Event Markets")

**Core terminologies used in event trading**

* Market: A market represents a specific binary outcome within an event that users can trade on (e.g., “Will candidate X win?”). Markets have yes/no positions, current prices, volume, and settlement rules.
* Event: An event is a collection of markets and the basic unit that members should interact with on Kalshi.
* Series: A series is a collection of related events. The following should hold true for events that make up a series:
* Category: A Category is a broader classifications that group related series together.

Webull provides different kinds of categories for event trading that covers 1-Economics, 2-Financials, 3-Politics, 4-Entertainment, 5-Science & Technology, 6-Climate and Weather, 7-Transportation, 8-Crypto, 9-Sports.

## Event Orders[​](#event-orders "Direct link to Event Orders")

### Be ready for Trading:[​](#be-ready-for-trading "Direct link to Be ready for Trading:")

1. You need to first open an Event account with Webull at mobile app.
2. You must sign the relevant trading agreements or disclosures prior to trading. You can sign via the mobile app, or should you encounter an error when placing an order via open api, the response message will contain a signing URL that you can access to log in and complete the agreement.
3. Certain trading categories, such as Sport, require signing an additional agreement or disclosure.

## Trading Hours[​](#trading-hours "Direct link to Trading Hours")

Trading hours vary by contract type and market. Crypto Event Contracts are available Monday through Friday from 8:00 AM to 6:00 PM EST, Index Event Contracts from 8:00 AM to 4:00 PM EST, and Economic Event Contracts, such as Fed rate events, from 8:00 AM to 11:00 PM EST.

Sports-related Event Contracts (Cleared Swaps) are available 24/7, outside of any maintenance windows. Cryptocurrency Event Contracts may also trade outside their standard hours. Trading hours are subject to change as new contracts are introduced.

## Order Types[​](#order-types "Direct link to Order Types")

Event trading supports only the following order types:

| Values |
| --- |
| LIMIT |

## TIF[​](#tif "Direct link to TIF")

Event trading supports only the following time in force:

| Values |
| --- |
| DAY |

## Trading Rules[​](#trading-rules "Direct link to Trading Rules")

* Event Contracts are not leveraged. If a trader wishes to buy "Yes" at $.50, they will spend $.50 (excluding commissions & fees).
* Event contract trading is not subject to PDT rules.
* Only "buy to open" and "sell to close" orders are allowed (selling to open is not permitted). You may buy to open the "No" position, which functions similarly to a put option.
* Maximum quantity per order: 50,000 ；
* Buying Yes vs Selling No：There's no inherent difference between buying a Yes contract and selling a No contract, or vice versa.

## Settlement & Expiry[​](#settlement--expiry "Direct link to Settlement & Expiry")

A market settles when the official outcome is confirmed and our markets team finalizes the result. When a market is resolved, holders of winning shares receive $1 per share, losing shares become worthless, and trading of shares is no longer possible.

You can enable notifications by subscribing position events to be alerted when a market you own settles.

## Event Market Data[​](#event-market-data "Direct link to Event Market Data")

Webull's Event Market Data API offers event market data access over HTTP. For more details, please refer to [the Event Market Data API Reference](/apis/docs/reference/market-data) .

## Event Trading Fees[​](#event-trading-fees "Direct link to Event Trading Fees")

A $0.01 fee is charged by the Exchange and another $0.01 by the Firm for each contract on both opening and closing trades. For more information, please refer to the [Webull's fee Schedule](https://www.webull.com/pricing#top)

---

# URL: https://developer.webull.com/apis/docs/trade-api/faq

* Trading API
* FAQ

On this page

# FAQ

### Q1: What is an API?[​](#q1-what-is-an-api "Direct link to Q1: What is an API?")

A: API stands for Application Programming Interface. Through APIs, clients can connect their own systems with Webull’s main system to perform actions such as getting quotes, inquiries, and automated trading.

### Q2. Why am I receiving an HTTP 403 Error (Forbidden)?[​](#q2-why-am-i-receiving-an-http-403-error-forbidden "Direct link to Q2. Why am I receiving an HTTP 403 Error (Forbidden)?")

A 403 error will be returned by the market data interface if any of the following conditions are met:

* The request does not contain authentication information.
* The authentication credentials are invalid.
* The user does not have sufficient permissions.

For more details, please refer to:  
User Authentication Process [Authentication](/apis/docs/authentication/overview).

### Q3: Do we need to worry about generating signatures when using the Webull SDK?[​](#q3-do-we-need-to-worry-about-generating-signatures-when-using-the-webull-sdk "Direct link to Q3: Do we need to worry about generating signatures when using the Webull SDK?")

A: No, the Webull SDK already encapsulates signature generation. No extra effort is needed.

### Q4: How long does API application approval take?[​](#q4-how-long-does-api-application-approval-take "Direct link to Q4: How long does API application approval take?")

A: The review and approval process for the API application is typically completed within 1 to 2 business days.

### Q5: Why do I need an App Key and App Secret?[​](#q5-why-do-i-need-an-app-key-and-app-secret "Direct link to Q5: Why do I need an App Key and App Secret?")

A: The App Key and App Secret are unique application-level identifiers assigned to developers. Only users with a valid App Key and App Secret can make requests and interact with the API.

---

# URL: https://developer.webull.com/apis/docs/trade-api/futures

* Trading API
* Futures Trading

On this page

# Futures Trading

Webull's Futures API enables developers to trade and query over HTTP.
For more details, please refer to the [Trading API Reference](/apis/docs/reference/trading).

Before calling the Trading API, you need to have an `App Key` and `secret`. For more information, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

## Base URLs[​](#base-urls "Direct link to Base URLs")

* **Production Environment**: `https://api.webull.com/`
* **Test Environment**: `http://us-openapi-alb.uat.webullbroker.com/`

## Supported Futures Contracts[​](#supported-futures-contracts "Direct link to Supported Futures Contracts")

Webull provides futures contracts for indices, interest rates, currencies, agriculture, metals, energies, and cryptocurrencies.

### Contract trading codes[​](#contract-trading-codes "Direct link to Contract trading codes")

Contract codes are often one to three letter codes identifying the asset that is attached to
a specific contract. For example, E-mini S&P 500 futures' contract code is ES. Make note that
these codes could vary across platforms. Following the contract code should be a letter and
a number, for example, ESG8. The G represents a month (February) and the 8 represents a year
(2018). Each month has its own letter. So, as in the example listed above, ESG8 would represent
an E-mini S&P 500 futures contract expiring in February of 2018.

| Jan. | Feb. | Mar. | Apr. | May | Jun. | Jul. | Aug. | Sep. | Oct. | Nov. | Dec. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F | G | H | J | K | M | N | Q | U | V | X | Z |

  

**To retrieve all available futures contracts, please use the API call below:**

* Python
* Java

```
from webull.data.common.category import Category  
from webull.data.common.contract_type import ContractType  
from webull.data.common.timespan import Timespan  
from webull.core.client import ApiClient  
from webull.data.data_client import DataClient  
  
optional_api_endpoint = "<api_endpoint>" # PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
if __name__ == '__main__':  
    data_client = DataClient(api_client)  
  
    res = data_client.futures_market_data.get_futures_quotes("SILZ5", Category.US_FUTURES.name, depth=1)  
    if res.status_code == 200:  
        print('get_futures_quotes:', res.json())  
  
    res = data_client.futures_market_data.get_futures_history_bars('SILZ5,6BM6', Category.US_FUTURES.name, Timespan.M1.name)  
    if res.status_code == 200:  
        print('get_futures_history_bars:', res.json())  
  
    res = data_client.futures_market_data.get_futures_tick("SILZ5", Category.US_FUTURES.name, count=10)  
    if res.status_code == 200:  
        print('get_futures_tick:', res.json())  
  
    res = data_client.futures_market_data.get_futures_snapshot("SILZ5,6BM6", Category.US_FUTURES.name)  
    if res.status_code == 200:  
        print('get_futures_snapshot:', res.json())  
  
    res = data_client.instrument.get_futures_products(Category.US_FUTURES.name)  
    if res.status_code == 200:  
        print('get_futures_products:', res.json())  
  
    res = data_client.instrument.get_futures_instrument("ESZ5", Category.US_FUTURES.name)  
    if res.status_code == 200:  
        print('get_futures_instrument:', res.json())  
  
    res = data_client.instrument.get_futures_instrument_by_code("ES", Category.US_FUTURES.name, ContractType.MONTHLY.name)  
    if res.status_code == 200:  
        print('get_futures_instrument_by_code:', res.json())
```

```
import com.webull.openapi.core.common.dict.Category;  
import com.webull.openapi.core.common.dict.ContractType;  
import com.webull.openapi.core.common.dict.Timespan;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.data.quotes.api.IDataClient;  
import com.webull.openapi.data.quotes.domain.*;  
import com.webull.openapi.samples.config.Env;  
  
import java.util.ArrayList;  
import java.util.HashSet;  
import java.util.List;  
import java.util.Set;  
  
public class DataClient {  
  
    private static final Logger logger = LoggerFactory.getLogger(DataClient.class);  
  
    public static void main(String[] args) {  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey(Env.APP_KEY)  
                .appSecret(Env.APP_SECRET)  
                .regionId(Env.REGION_ID)  
                // .endpoint("<api_endpoint>")  
                .build();  
        IDataClient dataClient = new com.webull.openapi.data.DataClient(apiConfig);  
  
        Quote futuresQuote = dataClient.getFuturesQuote("SILZ5", Category.US_FUTURES.name(), "1");  
        logger.info("Futures Quote: {}", futuresQuote);  
  
        Tick futureTicks = dataClient.getFuturesTicks("SILZ5", Category.US_FUTURES.name(), 100);  
        logger.info("Futures Ticks: {}", futureTicks);  
  
        Set<String> futuresSymbols = new HashSet<>();  
        futuresSymbols.add("ESZ5");  
        futuresSymbols.add("6BM6");  
        List<Snapshot> futureSnapshots = dataClient.getFuturesSnapshots(futuresSymbols, Category.US_FUTURES.name());  
        logger.info("Futures Snapshots: {}", futureSnapshots);  
  
        List<NBar> futureBars = dataClient.getFuturesBars(new ArrayList<>(futuresSymbols), Category.US_FUTURES.name(), Timespan.M1.name(), 10, false);  
        logger.info("Futures Bars: {}", futureBars);  
  
        List<FuturesProduct> futuresProducts = dataClient.getFuturesProducts(Category.US_FUTURES.name());  
        logger.info("Futures Products: {}", futuresProducts);  
  
        List<FuturesInstrument> futuresInstruments = dataClient.getFuturesInstruments(futuresSymbols, Category.US_FUTURES.name());  
        logger.info("Futures Instruments: {}", futuresInstruments);  
  
        List<FuturesInstrument> futuresInstrumentsByCode = dataClient.getFuturesInstrumentsByCode("ES", Category.US_FUTURES.name(), ContractType.MONTHLY.name());  
        logger.info("Futures Instruments By Code: {}", futuresInstrumentsByCode);  
    }  
}
```

## Futures Orders[​](#futures-orders "Direct link to Futures Orders")

### Trading Hours[​](#trading-hours "Direct link to Trading Hours")

The market for futures is open virtually 24 hrs. a day and 6 days a week. However, each product has its own specific hours of trading.

### Order Types[​](#order-types "Direct link to Order Types")

Futures trading supports only the following order types:

| Values |
| --- |
| MARKET |
| LIMIT |
| STOP\_LOSS |
| STOP\_LOSS\_LIMIT |
| TRAILING\_STOP\_LOSS |

Note

Combo Orders are not supported for futures trading at this time.

### TIF[​](#tif "Direct link to TIF")

Futures trading supports only the following time in force:

| Values |
| --- |
| DAY |
| GTC |

### Margin[​](#margin "Direct link to Margin")

* Initial margin is the cash you must deposit to open a position; it is usually three to twelve percent of the contract value.
* Intraday margin is available between 9:30 a.m. and 4:00 p.m. Eastern Time and is lower than overnight margin.
* Maintenance margin is the lowest equity you may keep while the position is open; it is lower than the initial margin. If your equity falls below maintenance margin you will receive a margin call; you will be asked to provide sufficient funds to bring the account back up to the initial margin requirement or your position will be liquidated.

### Settlement & Expiry[​](#settlement--expiry "Direct link to Settlement & Expiry")

* The majority of traders do not take physical delivery. They offset their positions before expiration by entering an opposite trade, canceling out their obligation. Physical delivery is not permitted at Webull.
* If a position is not closed by expiration, then the contract holder is required to either accept or provide the physical delivery of the underlying commodity. Most traders close their position before expiration to avoid taking physical delivery.

### Code Example[​](#code-example "Direct link to Code Example")

* Python
* Java

```
import json  
import uuid  
from time import sleep  
  
from webull.core.client import ApiClient  
from webull.trade.trade_client import TradeClient  
  
optional_api_endpoint = "<api_endpoint>" # PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "hk"  
account_id = "<your_account_id>" # Use account_list interface to get account info  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
  
    # normal futures order  
    normal_futures_client_order_id = uuid.uuid4().hex  
    print('futures client order id:', normal_futures_client_order_id)  
    new_normal_futures_orders = [  
        {  
            "combo_type": "NORMAL",  
            "client_order_id": normal_futures_client_order_id,  
            "symbol": "ESZ5",  
            "instrument_type": "FUTURES",  
            "market": "US",  
            "order_type": "LIMIT",  
            "limit_price": "4500",  
            "quantity": "1",  
            "side": "BUY",  
            "time_in_force": "DAY",  
            "entrust_type": "QTY"  
        }  
    ]  
    res = trade_client.order_v3.place_order(account_id, new_normal_futures_orders)  
    if res.status_code == 200:  
        print('place normal futures order res:', res.json())  
    sleep(3)  
  
    # normal futures order replace  
    replace_normal_futures_orders = [  
        {  
            "client_order_id": normal_futures_client_order_id,  
            "quantity": "2",  
            "limit_price": "4550"  
        }  
    ]  
    res = trade_client.order_v3.replace_order(account_id, replace_normal_futures_orders)  
    if res.status_code == 200:  
        print('replace normal futures order res:', res.json())  
    sleep(3)  
  
    # normal futures order cancel  
    res = trade_client.order_v3.cancel_order(account_id, normal_futures_client_order_id)  
    if res.status_code == 200:  
        print('cancel normal futures order res:', res.json())  
  
    # get futures order detail  
    res = trade_client.order_v3.get_order_detail(account_id, normal_futures_client_order_id)  
    if res.status_code == 200:  
        print('get futures order detail res:', res.json())  
  
    # get futures open orders  
    res = trade_client.order_v3.get_order_open(account_id, page_size=10)  
    if res.status_code == 200:  
        print("order_open_res=" + json.dumps(res.json(), indent=4))  
  
    # get futures order history  
    res = trade_client.order_v3.get_order_history(account_id, page_size=10)  
    if res.status_code == 200:  
        print('get order history res:', res.json())
```

```
import com.webull.openapi.core.common.dict.ComboType;  
import com.webull.openapi.core.common.dict.EntrustType;  
import com.webull.openapi.core.common.dict.InstrumentSuperType;  
import com.webull.openapi.core.common.dict.Markets;  
import com.webull.openapi.core.common.dict.OrderSide;  
import com.webull.openapi.core.common.dict.OrderTIF;  
import com.webull.openapi.core.common.dict.OrderType;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.utils.GUID;  
import com.webull.openapi.samples.config.Env;  
import com.webull.openapi.trade.request.v3.TradeOrder;  
import com.webull.openapi.trade.request.v3.TradeOrderItem;  
import com.webull.openapi.trade.response.v3.OrderHistory;  
import com.webull.openapi.trade.response.v3.PreviewOrderResponse;  
import com.webull.openapi.trade.response.v3.TradeOrderResponse;  
  
import java.util.ArrayList;  
import java.util.List;  
  
public class OrderTradeClient {  
  
    private static final Logger logger = LoggerFactory.getLogger(TradeClientV3.class);  
  
    public static void main(String[] args) throws InterruptedException {  
        OrderTradeClient orderTradeClient = new OrderTradeClient();  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey(Env.APP_KEY)            //<your_app_key>  
                .appSecret(Env.APP_SECRET)      //<your_app_secret>  
                .regionId(Env.REGION_ID)        //<your_region_id> @see com.webull.openapi.core.common.Region  
                // .endpoint("<api_endpoint>")  // env api host endpoint  
                .build();  
        com.webull.openapi.trade.TradeClientV3 apiService =  
                new com.webull.openapi.trade.TradeClientV3(apiConfig);  
  
        // Use getAccountList interface to get account info  
        String accountId = "#{accountId}"; //<your_account_id> from by Account Api  
        String clientOrderId = GUID.get();  
  
        // build place order params  
        TradeOrder tradeOrder = orderTradeClient.buildPlaceFuturesParam(clientOrderId);  
        // preview order  
        PreviewOrderResponse previewOrderResponse = apiService.previewOrder(accountId, tradeOrder);  
        logger.info("preview order resp: {}", previewOrderResponse);  
        // place order  
        TradeOrderResponse placeOrderResp = apiService.placeOrder(accountId, tradeOrder);  
        logger.info("place order resp: {}", placeOrderResp);  
        Thread.sleep(2000);  
  
        // modify order  
        TradeOrder replaceOrder = orderTradeClient.buildReplaceFuturesParam(clientOrderId);  
        TradeOrderResponse replaceOrderResp = apiService.replaceOrder(accountId, replaceOrder);  
        logger.info("replace order resp: {}", replaceOrderResp);  
        Thread.sleep(2000);  
  
        // cancel order  
        TradeOrder cancelOrder = orderTradeClient.buildCancelFuturesParam(clientOrderId);  
        TradeOrderResponse cancelOrderResp = apiService.cancelOrder(accountId, cancelOrder);  
        logger.info("cancel order resp: {}", cancelOrderResp);  
        Thread.sleep(2000);  
  
        // list futures orders  
        List<OrderHistory> listOrdersResp = apiService.listOrders(accountId, 10, null, null, null);  
        logger.info("list orders resp: {}", listOrdersResp);  
  
        // list open futures orders  
        List<OrderHistory> openOrdersResp = apiService.openOrders(accountId, 10, null);  
        logger.info("open orders resp: {}", openOrdersResp);  
  
        // get futures order detail  
        OrderHistory orderDetailResp = apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("order detail resp: {}", orderDetailResp);  
    }  
  
    private TradeOrder buildPlaceFuturesParam(String clientOrderId) {  
        TradeOrder tradeOrder = new TradeOrder();  
        List<TradeOrderItem> orderItemList = new ArrayList<>();  
        TradeOrderItem orderItem = new TradeOrderItem();  
        orderItemList.add(orderItem);  
  
        orderItem.setClientOrderId(clientOrderId);  
        orderItem.setComboType(ComboType.NORMAL.name());  
        orderItem.setSymbol("ESZ5");  
        orderItem.setInstrumentType(InstrumentSuperType.FUTURES.name());  
        orderItem.setMarket(Markets.US.name());  
        orderItem.setOrderType(OrderType.LIMIT.name());  
        orderItem.setQuantity("1");  
        orderItem.setLimitPrice("46000");  
        orderItem.setSide(OrderSide.BUY.name());  
        orderItem.setTimeInForce(OrderTIF.DAY.name());  
        orderItem.setEntrustType(EntrustType.QTY.name());  
        tradeOrder.setNewOrders(orderItemList);  
        logger.info("tradeOrder: {}", tradeOrder);  
        return tradeOrder;  
    }  
  
    private TradeOrder buildReplaceFuturesParam(String clientOrderId) {  
        TradeOrder replaceOrder = new TradeOrder();  
        List<TradeOrderItem> replaceOrderItemList = new ArrayList<>();  
        TradeOrderItem replaceOrderItem = new TradeOrderItem();  
        replaceOrderItemList.add(replaceOrderItem);  
  
        replaceOrderItem.setClientOrderId(clientOrderId);  
        replaceOrderItem.setLimitPrice("46000");  
        replaceOrderItem.setQuantity("2");  
        replaceOrder.setModifyOrders(replaceOrderItemList);  
        logger.info("replaceOrder: {}", replaceOrder);  
        return replaceOrder;  
    }  
  
    private TradeOrder buildCancelFuturesParam(String clientOrderId) {  
        TradeOrder cancelOrder = new TradeOrder();  
        cancelOrder.setClientOrderId(clientOrderId);  
        logger.info("cancelOrder: {}", cancelOrder);  
        return cancelOrder;  
  
    }  
}
```

## Futures Market Data[​](#futures-market-data "Direct link to Futures Market Data")

Webull's Futures Market Data API offers futures market data access over HTTP. For more details, please refer to [the Futures Market Data API Reference](/apis/docs/reference/futures-market-data).

Note

Currently, access to futures data via the OpenAPI requires a paid market-data subscription, which grants the necessary authorization. This subscription module is under active development and will be released soon—please stay tuned.

## Futures Trading Fees[​](#futures-trading-fees "Direct link to Futures Trading Fees")

Please refer to the [Webull's fee Schedule](https://www.webull.com/pricing#top)

---

# URL: https://developer.webull.com/apis/docs/trade-api/getting-started

* Trading API
* Getting Started

On this page

# Quick Start Guide

This quick guide will help you trade via the API. The guide covers: installing the Webull SDK and how to query account information.

## 1. Install the Webull Client SDK[​](#1-install-the-webull-client-sdk "Direct link to 1. Install the Webull Client SDK")

## Requirements[​](#requirements "Direct link to Requirements")

* Python

[Python](https://www.python.org/) version 3.8 through 3.11 is required.

### SDK Installation[​](#sdk-installation "Direct link to SDK Installation")

* Python

Install via pip

```
pip3 install --upgrade webull-openapi-python-sdk
```

## 2. Generate API Keys and Authenticate[​](#2-generate-api-keys-and-authenticate "Direct link to 2. Generate API Keys and Authenticate")

Each API call requires authentication based on the App Key and a signature generated using the secret key.
The client must provide the App Key and the signature in the HTTP request headers named `x-app-key` and `x-signature` respectively.

For instructions on obtaining the App Key and secret, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

For rules on how to generate the signature based on the secret key, please refer to the [Signature](/apis/docs/authentication/signature).

## 3. Using the Trading API via SDK[​](#3-using-the-trading-api-via-sdk "Direct link to 3. Using the Trading API via SDK")

After installing the SDK and obtaining API keys, you can use the Trading API. The following example demonstrates how to retrieve the account list; for more operations, please refer to the [Trading API Reference](/apis/docs/reference/custom/trading-api).

### 3.1 Retrieve Account List[​](#31-retrieve-account-list "Direct link to 3.1 Retrieve Account List")

* Python

```
import json  
  
from webull.core.client import ApiClient  
from webull.data.common.category import Category  
from webull.trade.trade_client import TradeClient  
  
# PRD env host: api.webull.com;   
# Test env host: us-openapi-alb.uat.webullbroker.com  
optional_api_endpoint = "<api_endpoint>"  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
account_id = "<your_account_id>"  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
    res = trade_client.account_v2.get_account_list()  
    if res.status_code == 200:  
        print("account_list=" + json.dumps(res.json(), indent=4))
```

### 3.2 Trading API Usage Examples[​](#32-trading-api-usage-examples "Direct link to 3.2 Trading API Usage Examples")

This zip file provides Trading API call examples based on the official `Python SDK`,
covering core functionalities such as account management, order place, and position inquiries.
It is suitable for quickly verifying trading logic and debugging locally.

Download [webull-openapi-demo-py.zip](https://wbstatic.webullfintech.com/app/attachment/webull-openapi-demo-py-us.db3409e012c4c85ef51ebb8e0a765062.zip)

---

# URL: https://developer.webull.com/apis/docs/trade-api/overview

* Trading API
* Overview

On this page

# Introduction

The Trading API is divided into the Trade API and Data Events API, supporting trading and order status change subscriptions via HTTP and gRPC protocols. Its purpose is to provide investors with convenient, fast, and secure trading services.

To simplify the integration process, we provide SDKs for Python and JAVA. These SDKs are fully featured and enable developers to get started quickly.

**Main Features:**

Account Information: Query account balance and holdings information.

Trade Management: Create, modify, and cancel orders.

Subscribe to Real-Time Information: Subscribe to order status changes.

## Trading API Overview[​](#trading-api-overview "Direct link to Trading API Overview")

| Type | Function Overview | Protocol | Description | Threshold |
| --- | --- | --- | --- | --- |
| [Instruments](/apis/docs/reference/instrument) | [Get Instruments](/apis/docs/reference/query-instruments) | HTTP | Retrieve a list of instruments for the given symbols | 10/30s |
| [Get Futures Contracts](/apis/docs/reference/futures-instrument-list) | HTTP | Retrieve futures contracts for the given symbols | 10/30s |
| [Get Futures Contract By Code](/apis/docs/reference/query-instruments) | HTTP | Retrieve a futures contract using the base code | 10/30s |
| [Get Futures Products](/apis/docs/reference/futures-products) | HTTP | Retrieve the list of available futures products for a specified market. | 10/30s |
| [Get Crypto Instrument](/apis/docs/reference/crypto-instrument-list) | HTTP | Retrieve a list of cryptocurrency instruments for the specified symbols | 10/30s |
| [Account](/apis/docs/reference/instrument) | [Account List](/apis/docs/reference/account) | HTTP | Query account list | 10/30s |
| [Account Balance](/apis/docs/reference/account-balance) | HTTP | Query account balance by account id | 2/2s |
| [Account Positions](/apis/docs/reference/account-position) | HTTP | Query account position list by account id | 2/2s |
| [Orders](/apis/docs/reference/custom/order) | [Estimate Orders](/apis/docs/reference/common-order-preview) | HTTP | Estimate the amount and cost for orders (supports stocks, options, futures, and crypto) | 150/10s |
| [Place Orders](/apis/docs/reference/common-order-place) | HTTP | Place orders (supports stocks, options, futures, and crypto) | 600/60s |
| [Replace Orders](/apis/docs/reference/option-replace) | HTTP | Replace existing orders (supports stocks, options, futures, and crypto) | 600/60s |
| [Cancel Order](/apis/docs/reference/option-cancel) | HTTP | Cancel ordersusing the provided client\_order\_id (supports stocks, options, futures, and crypto) | 600/60s |
| [Equity Order](/apis/docs/reference/custom/order) | [Estimate Equity Order](/apis/docs/reference/preview-order) | HTTP | Calculate the estimated order amount and associated costs based on the input information. Supports basic equity orders | 150/10s |
| [Place Equity Order](/apis/docs/reference/place-order) | HTTP | Place equity orders | 600/60s |
| [Replace Equity Order](/apis/docs/reference/replace-order) | HTTP | Modify equity orders | 600/60s |
| [Cancel Equity Order](/apis/docs/reference/cancel-order) | HTTP | Cancel the equity order according to the incoming client\_order\_id | 600/60s |
| [Option Order](/apis/docs/reference/custom/order) | [Estimate Option Order](/apis/docs/reference/option-preview) | HTTP | Calculate estimated amount and fees based on the input information, supporting general options orders | 150/10s |
| [Place Option Order](/apis/docs/reference/option-place) | HTTP | Place options orders | 600/60s |
| [Replace Option Order](/apis/docs/reference/option-replace) | HTTP | Modify existing options orders | 600/60s |
| [Cancel Option Order](/apis/docs/reference/option-cancel) | HTTP | Cancel options orders using the provided client\_order\_id | 600/60s |
| [Query Order](/apis/docs/reference/custom/order) | [Query Historical Orders](/apis/docs/reference/order-history) | HTTP | Retrieve historical order information, including both equities and options | 2/2s |
| [Query Open Order](/apis/docs/reference/order-open) | HTTP | Query pending orders by page | 2/2s |
| [Query Order Details](/apis/docs/reference/order-detail) | HTTP | Retrieve detailed information about specific orders, including both equities and options | 2/2s |
| [Event](/apis/docs/reference/custom/order) | [Trading Event Subscription](/apis/docs/reference/custom/subscribe-trade-events) | gRPC | Subsccribe to receive live updates on order status changes | \ |

---

# URL: https://developer.webull.com/apis/docs/trade-api/trade

* Trading API
* Orders

On this page

# Orders

Webull’s Orders API enables developers to trade and query over HTTP.
For more details, please refer to the [API Reference](/apis/docs/reference/custom/order).

Before calling the Trading API, you need to have an App Key and secret. For more information, please refer to the [Individual Application Process](/apis/docs/authentication/IndividualApplicationAPI).

## 1. Supported Markets[​](#1-supported-markets "Direct link to 1. Supported Markets")

The Trading API supports the following markets:

| Market | Products |
| --- | --- |
| United States | US equity products (stocks, options)   Futures   Cryptocurrencies   Event Contracts |

## 2. Base URLs[​](#2-base-urls "Direct link to 2. Base URLs")

* **Production Environment**: `https://api.webull.com/`
* **Test Environment**: `http://us-openapi-alb.uat.webullbroker.com/`

## 3. Code Example[​](#3-code-example "Direct link to 3. Code Example")

### 3.1 Stock Orders[​](#31-stock-orders "Direct link to 3.1 Stock Orders")

**Parameters for Order Types**

* Simple
* OTO
* OTOCO
* OCO
* Take-Profit/Stop-Loss

```
{  
  "account_id": "<your_account_id>",  
  "new_orders": [  
    {  
      "client_order_id": "<client_order_id>",  
      "instrument_type": "EQUITY",  
      "symbol": "BULL",  
      "market": "US",  
      "side": "BUY",  
      "order_type": "LIMIT",  
      "limit_price": "11.0",  
      "quantity": "1",  
      "support_trading_session": "CORE",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY",  
      "combo_type": "NORMAL"  
    }  
  ]  
}
```

```
{  
  "account_id": "<your_account_id>",  
  "client_combo_order_id":"<client_combo_order_id>",  
  "new_orders": [  
    {  
      "combo_type": "MASTER",  
      "client_order_id": "<client_order_id>",  
      "instrument_type": "EQUITY",  
      "symbol": "BULL",  
      "market": "US",  
      "side": "BUY",  
      "order_type": "LIMIT",  
      "limit_price": "11.0",  
      "quantity": "1",  
      "support_trading_session": "CORE",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    },  
    {  
      "combo_type": "OTO",  
      "client_order_id": "<client_order_id>",  
      "instrument_type": "EQUITY",  
      "symbol": "BULL",  
      "market": "US",  
      "side": "BUY",  
      "order_type": "LIMIT",  
      "limit_price": "11.0",  
      "quantity": "1",  
      "support_trading_session": "CORE",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    }  
  ]  
}
```

```
{  
  "account_id":"<your_account_id>",  
  "client_combo_order_id": "<client_combo_order_id>",   
  "new_orders": [  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "MASTER",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "limit_price": "180",  
      "side": "BUY",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    },  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "OTOCO",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "limit_price": "181",  
      "side": "BUY",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    },  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "OTOCO",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "limit_price": "182",  
      "side": "BUY",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    }  
  ]  
}
```

```
{  
  "account_id": "<your_account_id>",  
  "client_combo_order_id": "<client_combo_order_id>",  
  "new_orders": [  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "OCO",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "limit_price": "180",  
      "side": "BUY",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    },  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "OCO",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "limit_price": "181",  
      "side": "BUY",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    },  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "OCO",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "limit_price": "182",  
      "side": "BUY",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    }  
  ]  
}
```

```
{  
  "account_id": "<your_account_id>",  
  "client_combo_order_id": "<client_combo_order_id>",  
  "new_orders": [  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "MASTER",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "limit_price": "209.23",  
      "side": "BUY",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    },  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "STOP_PROFIT",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "limit_price": "211.32",  
      "side": "SELL",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    },  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "STOP_LOSS",  
      "symbol": "AAPL",  
      "instrument_type": "EQUITY",  
      "market": "US",  
      "order_type": "STOP_LOSS",  
      "quantity": "1",  
      "support_trading_session": "N",  
      "stop_price": "207.14",  
      "side": "SELL",  
      "entrust_type": "QTY",  
      "time_in_force": "DAY"  
    }  
  ]  
}
```

**SDK Examples**

* Python
* Java

```
import uuid  
from webull.core.client import ApiClient  
from webull.trade.trade_client import TradeClient  
  
optional_api_endpoint = "<webull_api_host>" # PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
account_id = "<your_account_id>" # Use account_list interface to get account info  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
  
  
    # simple order  
    client_order_id = uuid.uuid4().hex  
    print('client order id:', client_order_id)  
    new_simple_orders = [  
        {  
            "client_order_id": client_order_id,  
            "symbol": "BULL",  
            "instrument_type": "EQUITY",  
            "market": "US",  
            "order_type": "LIMIT",  
            "limit_price": "26",  
            "quantity": "1",  
            "support_trading_session": "CORE",  
            "side": "BUY",  
            "time_in_force": "DAY",  
            "entrust_type": "QTY"  
        }  
    ]  
  
    res = trade_client.order_v2.preview_order(account_id, new_simple_orders)  
    if res.status_code == 200:  
        print('preview order res:', res.json())  
  
    res = trade_client.order_v2.place_order(account_id, new_simple_orders)  
    if res.status_code == 200:  
        print('place order res:', res.json())  
  
    modify_simple_orders = [  
        {  
            "client_order_id": client_order_id,  
            "quantity": "2",  
            "limit_price": "25"  
        }  
    ]  
    res = trade_client.order_v2.replace_order(account_id, modify_simple_orders)  
    if res.status_code == 200:  
        print('replace order res:', res.json())  
  
    res = trade_client.order_v2.cancel_order(account_id, client_order_id)  
    if res.status_code == 200:  
        print('cancel order res:', res.json())  
  
    res = trade_client.order_v2.get_order_detail(account_id, client_order_id)  
    if res.status_code == 200:  
        print('order detail:', res.json())
```

```
import com.webull.openapi.core.common.Region;  
import com.webull.openapi.core.common.dict.*;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.utils.GUID;  
import com.webull.openapi.samples.config.Env;  
import com.webull.openapi.trade.request.v2.TradeOrder;  
import com.webull.openapi.trade.request.v2.TradeOrderItem;  
import com.webull.openapi.trade.response.v2.OrderHistory;  
import com.webull.openapi.trade.response.v2.TradeOrderResponse;  
  
import java.util.ArrayList;  
import java.util.List;  
  
public class OrderStockTradeClient {  
    private static final Logger logger = LoggerFactory.getLogger(OrderStockTradeClient.class);  
  
    public static void main(String[] args) {  
        OrderStockTradeClient orderStockTradeClient = new OrderStockTradeClient();  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                //<your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId("us")                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
        com.webull.openapi.trade.TradeClientV2 apiService = new com.webull.openapi.trade.TradeClientV2(apiConfig);  
  
        // Use getAccountList interface to get account info  
        String accountId = "#{accountId}"; //<your_account_id> from by Account Api  
        String clientOrderId = GUID.get();  
        com.webull.openapi.trade.TradeClientV2 apiService = new com.webull.openapi.trade.TradeClientV2(apiConfig);  
  
        // build place order params  
        TradeOrder tradeOrder = orderStockTradeClient.buildPlaceStockParams(clientOrderId);  
        // place order  
        TradeOrderResponse placeOrderResp = apiService.placeOrder(accountId,tradeOrder);  
        logger.info("Place order response: {}", placeOrderResp);  
  
        // get order detail  
        OrderHistory orderDetail = apiService.getOrderDetails(accountId,clientOrderId);  
        logger.info("Order details response: {}", orderDetail);  
  
        // replace order  
        TradeOrder modifyTradeOrder = orderStockTradeClient.buildReplaceOrderParams(clientOrderId);  
        TradeOrderResponse modifyOrderResponse = apiService.replaceOrder(accountId, modifyTradeOrder);  
        logger.info("Order modify response: {}", modifyOrderResponse);  
  
        // query order detail after replace order  
        OrderHistory orderDetail1 = apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("Order orderDetail response after replace order: {}", orderDetail1);  
  
        // cancel order  
        TradeOrder cancelOrder = new TradeOrder();  
        cancelOrder.setClientOrderId(clientOrderId);  
        TradeOrderResponse cancelOrderResponse = apiService.cancelOrder(accountId, cancelOrder);  
        logger.info("Order cancel order response: {}", cancelOrderResponse);  
  
        // query order detail after cancel order  
        OrderHistory orderDetail2 = apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("Order orderDetail response after cancel: {}", orderDetail2.getOrders().get(0).getStatus());  
  
  
    }  
  
    /**  
     * build your place order object  
     *  
     * @param clientOrderId  
     * @return  
     */  
    private TradeOrder buildPlaceStockParams(String clientOrderId) {  
        TradeOrder tradeOrder = new TradeOrder();  
        List<TradeOrderItem> newOrders = new ArrayList<>();  
        TradeOrderItem placeOne = new TradeOrderItem();  
        placeOne.setClientOrderId(clientOrderId);  
        // WebullUS need set combo_type, because WebullUS support combo order  
        placeOne.setComboType(ComboType.NORMAL.name());  
        newOrders.add(placeOne);  
        placeOne.setSymbol("BULL");  
        placeOne.setInstrumentType(InstrumentSuperType.EQUITY.name());  
        placeOne.setMarket(Region.us.name().toUpperCase());  
        placeOne.setOrderType(OrderType.LIMIT.name());  
        placeOne.setQuantity("1");  
        placeOne.setLimitPrice("25");  
        placeOne.setSupportTradingSession("ALL");  
        placeOne.setSide(OrderSide.BUY.name());  
        placeOne.setTimeInForce(OrderTIF.DAY.name());  
        placeOne.setEntrustType(EntrustType.QTY.name());  
        tradeOrder.setNewOrders(newOrders);  
        return tradeOrder;  
    }  
  
    /**  
     * build your replace order params  
     * @param clientOrderId  
     * @return replace order object  
     */  
    private TradeOrder buildReplaceOrderParams(String clientOrderId) {  
        TradeOrder replaceTradeOrder = new TradeOrder();  
        List<TradeOrderItem> modifyOrders = new ArrayList<>();  
        TradeOrderItem modifyOne = new TradeOrderItem();  
        modifyOne.setClientOrderId(clientOrderId);  
        modifyOne.setLimitPrice("25");  
        modifyOne.setQuantity("2");  
        modifyOrders.add(modifyOne);  
        replaceTradeOrder.setModifyOrders(modifyOrders);  
        return replaceTradeOrder;  
    }  
  
}
```

### 3.2 Options Orders[​](#32-options-orders "Direct link to 3.2 Options Orders")

**Parameters for Order Types**

* Single-Leg
* Multi-Leg:COVERED\_STOCK
* Take-Profit/Stop-Loss

```
{  
  "account_id": "<your_account_id>",  
  "new_orders": [  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "NORMAL",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "limit_price": "220.25",  
      "option_strategy": "SINGLE",  
      "side": "BUY",  
      "time_in_force": "DAY",  
      "entrust_type": "QTY",  
      "legs": [  
        {  
          "side": "BUY",  
          "quantity": "1",  
          "symbol": "AAPL",  
          "strike_price": "220",  
          "init_exp_date": "2025-11-19",  
          "instrument_type": "OPTION",  
          "option_type": "CALL",  
          "market": "US"  
        }  
      ]  
    }  
  ]  
}
```

```
{  
  "account_id": "<your_account_id>",  
  "new_orders": [  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "NORMAL",  
      "option_strategy": "COVERED_STOCK",  
      "order_type": "MARKET",  
      "quantity": "2",  
      "side": "BUY",  
      "time_in_force": "DAY",  
      "entrust_type": "QTY",  
      "legs": [  
        {  
          "side": "BUY",  
          "quantity": "200",  
          "symbol": "TSLA",  
          "instrument_type": "EQUITY",  
          "market": "US"  
        },  
        {  
          "side": "SELL",  
          "quantity": "2",  
          "symbol": "TSLA",  
          "strike_price": "220",  
          "init_exp_date": "2025-11-19",  
          "instrument_type": "OPTION",  
          "option_type": "CALL",  
          "market": "US"  
        }  
      ]  
    }  
  ]  
}
```

```
{  
  "account_id": "<your_account_id>",  
  "client_combo_order_id": "<client_combo_order_id>",  
  "new_orders": [  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "MASTER",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "limit_price": "11.25",  
      "option_strategy": "SINGLE",  
      "side": "BUY",  
      "time_in_force": "DAY",  
      "entrust_type": "QTY",  
      "legs": [  
        {  
          "side": "BUY",  
          "quantity": "1",  
          "symbol": "AAPL",  
          "strike_price": "270",  
          "init_exp_date": "2025-11-19",  
          "instrument_type": "OPTION",  
          "option_type": "CALL",  
          "market": "US"  
        }  
      ]  
    },  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "STOP_PROFIT",  
      "order_type": "LIMIT",  
      "quantity": "1",  
      "limit_price": "11",  
      "option_strategy": "SINGLE",  
      "side": "SELL",  
      "time_in_force": "DAY",  
      "entrust_type": "QTY",  
      "legs": [  
        {  
          "side": "SELL",  
          "quantity": "1",  
          "symbol": "AAPL",  
          "strike_price": "270",  
          "init_exp_date": "2025-11-19",  
          "instrument_type": "OPTION",  
          "option_type": "CALL",  
          "market": "US"  
        }  
      ]  
    },  
    {  
      "client_order_id": "<client_order_id>",  
      "combo_type": "STOP_LOSS",  
      "order_type": "STOP_LOSS",  
      "quantity": "1",  
      "stop_price": "11",  
      "option_strategy": "SINGLE",  
      "side": "SELL",  
      "time_in_force": "DAY",  
      "entrust_type": "QTY",  
      "legs": [  
        {  
          "side": "SELL",  
          "quantity": "1",  
          "symbol": "AAPL",  
          "strike_price": "270",  
          "init_exp_date": "2025-11-19",  
          "instrument_type": "OPTION",  
          "option_type": "CALL",  
          "market": "US"  
        }  
      ]  
    }  
  ]  
}
```

**SDK Examples**

* Python
* Java

```
import uuid  
from webull.core.client import ApiClient  
from webull.trade.trade_client import TradeClient  
  
optional_api_endpoint = "<webull_api_host>" # PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
account_id = "<your_account_id>" # Use account_list interface to get account info  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
  
    # Options  
    # For option order inquiries, please use the V2 query interface: api.order_v2.get_order_detail(account_id, client_order_id).  
    client_order_id = uuid.uuid4().hex  
    option_new_orders = [  
        {  
            "client_order_id": client_order_id,  
            "combo_type": "NORMAL",  
            "order_type": "LIMIT",  
            "quantity": "1",  
            "limit_price": "21.25",  
            "option_strategy": "SINGLE",  
            "side": "BUY",  
            "time_in_force": "GTC",  
            "entrust_type": "QTY",  
            "legs": [  
                {  
                    "side": "BUY",  
                    "quantity": "1",  
                    "symbol": "TSLA",  
                    "strike_price": "400",  
                    "option_expire_date": "2025-11-26",  
                    "instrument_type": "OPTION",  
                    "option_type": "CALL",  
                    "market": "US"  
                }  
            ]  
        }  
    ]  
  
    # preview  
    res = trade_client.order_v2.preview_option(account_id, option_new_orders)  
    if res.status_code == 200:  
        print("preview option res:", res.json())  
  
    # place  
    res = trade_client.order_v2.place_option(account_id, option_new_orders)  
    if res.status_code == 200:  
        print("place option res:" , res.json())  
  
    option_modify_orders = [  
        {  
            "client_order_id": client_order_id,  
            "quantity": "2",  
            "limit_price": "21.25"  
        }  
    ]  
    res = trade_client.order_v2.replace_option(account_id, option_modify_orders)  
    if res.status_code == 200:  
        print("Replace option order res:" , res.json())  
  
    res = trade_client.order_v2.cancel_option(account_id, client_order_id)  
    if res.status_code == 200:  
        print("Replace option order res:" , res.json())  
  
    res = trade_client.order_v2.get_order_detail(account_id, client_order_id)  
    if res.status_code == 200:  
        print("Option order detail order res:" , res.json())
```

```
import com.webull.openapi.core.common.Region;  
import com.webull.openapi.core.common.dict.*;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.utils.GUID;  
import com.webull.openapi.samples.config.Env;  
import com.webull.openapi.trade.request.v2.TradeOrder;  
import com.webull.openapi.trade.request.v2.TradeOrderItem;  
import com.webull.openapi.trade.response.v2.OrderHistory;  
import com.webull.openapi.trade.response.v2.TradeOrderResponse;  
  
import java.util.ArrayList;  
import java.util.List;  
  
public class OrderStockTradeClient {  
    private static final Logger logger = LoggerFactory.getLogger(OrderStockTradeClient.class);  
  
    public static void main(String[] args) {  
        OrderStockTradeClient orderStockTradeClient = new OrderStockTradeClient();  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                //<your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId("us")                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
        com.webull.openapi.trade.TradeClientV2 apiService = new com.webull.openapi.trade.TradeClientV2(apiConfig);  
  
        // Use getAccountList interface to get account info  
        String accountId = "#{accountId}"; //<your_account_id> from by Account Api  
        String clientOrderId = GUID.get();  
        com.webull.openapi.trade.TradeClientV2 apiService = new com.webull.openapi.trade.TradeClientV2(apiConfig);  
  
        // build place order params  
        TradeOrder tradeOrder = orderStockTradeClient.buildPlaceStockParams(clientOrderId);  
        // place order  
        TradeOrderResponse placeOrderResp = apiService.placeOrder(accountId,tradeOrder);  
        logger.info("Place order response: {}", placeOrderResp);  
  
        // get order detail  
        OrderHistory orderDetail = apiService.getOrderDetails(accountId,clientOrderId);  
        logger.info("Order details response: {}", orderDetail);  
  
        // replace order  
        TradeOrder modifyTradeOrder = orderStockTradeClient.buildReplaceOrderParams(clientOrderId);  
        TradeOrderResponse modifyOrderResponse = apiService.replaceOrder(accountId, modifyTradeOrder);  
        logger.info("Order modify response: {}", modifyOrderResponse);  
  
        // query order detail after replace order  
        OrderHistory orderDetail1 = apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("Order orderDetail response after replace order: {}", orderDetail1);  
  
        // cancel order  
        TradeOrder cancelOrder = new TradeOrder();  
        cancelOrder.setClientOrderId(clientOrderId);  
        TradeOrderResponse cancelOrderResponse = apiService.cancelOrder(accountId, cancelOrder);  
        logger.info("Order cancel order response: {}", cancelOrderResponse);  
  
        // query order detail after cancel order  
        OrderHistory orderDetail2 = apiService.getOrderDetails(accountId, clientOrderId);  
        logger.info("Order orderDetail response after cancel: {}", orderDetail2.getOrders().get(0).getStatus());  
  
  
    }  
  
    /**  
     * build your place order object  
     *  
     * @param clientOrderId  
     * @return  
     */  
    private TradeOrder buildPlaceStockParams(String clientOrderId) {  
        TradeOrder tradeOrder = new TradeOrder();  
        List<TradeOrderItem> newOrders = new ArrayList<>();  
        TradeOrderItem placeOne = new TradeOrderItem();  
        placeOne.setClientOrderId(clientOrderId);  
        // WebullUS need set combo_type, because WebullUS support combo order  
        placeOne.setComboType(ComboType.NORMAL.name());  
        newOrders.add(placeOne);  
        placeOne.setSymbol("BULL");  
        placeOne.setInstrumentType(InstrumentSuperType.EQUITY.name());  
        placeOne.setMarket(Region.us.name().toUpperCase());  
        placeOne.setOrderType(OrderType.LIMIT.name());  
        placeOne.setQuantity("1");  
        placeOne.setLimitPrice("25");  
        placeOne.setSupportTradingSession("ALL");  
        placeOne.setSide(OrderSide.BUY.name());  
        placeOne.setTimeInForce(OrderTIF.DAY.name());  
        placeOne.setEntrustType(EntrustType.QTY.name());  
        tradeOrder.setNewOrders(newOrders);  
        return tradeOrder;  
    }  
  
    /**  
     * build your replace order params  
     * @param clientOrderId  
     * @return replace order object  
     */  
    private TradeOrder buildReplaceOrderParams(String clientOrderId) {  
        TradeOrder replaceTradeOrder = new TradeOrder();  
        List<TradeOrderItem> modifyOrders = new ArrayList<>();  
        TradeOrderItem modifyOne = new TradeOrderItem();  
        modifyOne.setClientOrderId(clientOrderId);  
        modifyOne.setLimitPrice("25");  
        modifyOne.setQuantity("2");  
        modifyOrders.add(modifyOne);  
        replaceTradeOrder.setModifyOrders(modifyOrders);  
        return replaceTradeOrder;  
    }  
  
}
```

### 3.3 Futures Orders[​](#33-futures-orders "Direct link to 3.3 Futures Orders")

**Parameters for Order Types**

* Python
* Java

### 3.4 Crypto Orders[​](#34-crypto-orders "Direct link to 3.4 Crypto Orders")

**SDK Examples**

* Python
* Java

```
import uuid  
from time import sleep  
  
from webull.core.client import ApiClient  
from webull.trade.trade_client import TradeClient  
  
optional_api_endpoint = "<webull_api_host>" # PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
your_app_key = "<your_app_key>"  
your_app_secret = "<your_app_secret>"  
region_id = "us"  
account_id = "<your_account_id>" # Use account_list interface to get account info  
api_client = ApiClient(your_app_key, your_app_secret, region_id)  
api_client.add_endpoint(region_id, optional_api_endpoint)  
  
  
if __name__ == '__main__':  
    trade_client = TradeClient(api_client)  
  
    # normal crypto order  
    normal_crypto_client_order_id = uuid.uuid4().hex  
    print('normal crypto client order id:', normal_crypto_client_order_id)  
    new_normal_crypto_orders = [  
        {  
            "combo_type": "NORMAL",  
            "client_order_id": normal_crypto_client_order_id,  
            "symbol": "BTCUSD",  
            "instrument_type": "CRYPTO",  
            "market": "US",  
            "order_type": "LIMIT",  
            "limit_price": "80000",  
            "quantity": "0.003",  
            "side": "BUY",  
            "time_in_force": "DAY",  
            "entrust_type": "QTY"  
        }  
    ]  
  
    res = trade_client.order_v3.place_order(account_id, new_normal_crypto_orders)  
    if res.status_code == 200:  
        print('place normal crypto order res:', res.json())  
    sleep(3)  
  
    res = trade_client.order_v3.cancel_order(account_id, normal_crypto_client_order_id)  
    if res.status_code == 200:  
        print('cancel normal crypto order res:', res.json())  
  
    res = trade_client.order_v3.get_order_detail(account_id, normal_crypto_client_order_id)  
    if res.status_code == 200:  
        print('get normal crypto order detail res:', res.json())
```

```
import com.webull.openapi.core.common.dict.ComboType;  
import com.webull.openapi.core.common.dict.EntrustType;  
import com.webull.openapi.core.common.dict.InstrumentSuperType;  
import com.webull.openapi.core.common.dict.Markets;  
import com.webull.openapi.core.common.dict.OrderSide;  
import com.webull.openapi.core.common.dict.OrderTIF;  
import com.webull.openapi.core.common.dict.OrderType;  
import com.webull.openapi.core.http.HttpApiConfig;  
import com.webull.openapi.core.logger.Logger;  
import com.webull.openapi.core.logger.LoggerFactory;  
import com.webull.openapi.core.utils.GUID;  
import com.webull.openapi.trade.TradeClientV3;  
import com.webull.openapi.trade.request.v3.TradeOrder;  
import com.webull.openapi.trade.request.v3.TradeOrderItem;  
import com.webull.openapi.trade.response.v3.OrderHistory;  
import com.webull.openapi.trade.response.v3.TradeOrderResponse;  
  
import java.util.ArrayList;  
import java.util.List;  
  
public class OrderCryptoTradeClient {  
    private static final Logger logger = LoggerFactory.getLogger(OrderCryptoTradeClient.class);  
  
    public static void main(String[] args) throws InterruptedException {  
        HttpApiConfig apiConfig = HttpApiConfig.builder()  
                .appKey("<your_app_key>")                //<your_app_key>  
                .appSecret("<your_app_secret>")          //<your_app_secret>  
                .regionId("us")                          //<your_region_id> @see com.webull.openapi.core.common.Region  
                .endpoint("<webull_api_host>")           //PRD env host: api.webull.com; Test env host: us-openapi-alb.uat.webullbroker.com  
                .build();  
        TradeClientV3 apiService = new TradeClientV3(apiConfig);  
  
        // Use getAccountList interface to get account info  
        String accountId = "#{accountId}"; //<your_account_id> from by Account Api  
        String clientOrderId = GUID.get();  
        logger.info("normal crypto client order id : {}", clientOrderId);  
  
        // Normal Crypto Example  
        TradeOrder newNormalCryptoOrder = new TradeOrder();  
        List<TradeOrderItem> newNormalCryptoOrders = new ArrayList<>();  
  
        TradeOrderItem normalCryptoOrder = new TradeOrderItem();  
        newNormalCryptoOrders.add(normalCryptoOrder);  
        normalCryptoOrder.setClientOrderId(clientOrderId);  
        normalCryptoOrder.setComboType(ComboType.NORMAL.name());  
        normalCryptoOrder.setSymbol("BTCUSD");  
        normalCryptoOrder.setInstrumentType(InstrumentSuperType.CRYPTO.name());  
        normalCryptoOrder.setMarket(Markets.US.name());  
        normalCryptoOrder.setOrderType(OrderType.LIMIT.name());  
        normalCryptoOrder.setQuantity("0.003");  
        normalCryptoOrder.setLimitPrice("80000");  
        normalCryptoOrder.setSide(OrderSide.BUY.name());  
        normalCryptoOrder.setTimeInForce(OrderTIF.DAY.name());  
        normalCryptoOrder.setEntrustType(EntrustType.QTY.name());  
        newNormalCryptoOrder.setNewOrders(newNormalCryptoOrders);  
  
        TradeOrderResponse placeNormalCryptoResponse = apiService.placeOrder(accountId, newNormalCryptoOrder);  
        logger.info("Place normal crypto response: {}", placeNormalCryptoResponse);  
        Thread.sleep(3 * 1000L);  
  
        TradeOrder cancelNormalCryptoOrder = new TradeOrder();  
        cancelNormalCryptoOrder.setClientOrderId(clientOrderId);  
        TradeOrderResponse cancelNormalCryptoResponse = apiService.cancelOrder(accountId, cancelNormalCryptoOrder);  
        logger.info("cancel normal crypto: {}", cancelNormalCryptoResponse);  
  
        OrderHistory orderDetail = apiService.getOrderDetails(accountId, normalCryptoOrder.getClientOrderId());  
        logger.info("Order details: {}", orderDetail);  
    }  
}
```

---

# URL: https://developer.webull.com/apis/docs/webull-open-api-reference

* Introduction

Version: 2.0

# Webull Open API Reference

We are pleased to learn of your interest in integrating with Webull.

As a technology-driven brokerage platform, Webull is committed to enabling seamless and efficient partnerships. To support a smooth integration process, we provide detailed developer guides designed to help you implement and validate your solution, including the successful execution of initial test trades.

Should you require assistance at any stage of development, please do not hesitate to contact our support team.

🚧 Please note that the content provided on this site is intended for developmental reference only. It is not representative of Webull’s official operational procedures and may be updated periodically. This information does not constitute legal, tax, or regulatory advice. We strongly advise consulting with qualified legal and compliance professionals in your jurisdiction before launching any securities-related product.

### Contact

---

