/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

async function fetchAppAccessToken(client_id, client_secret) {
  const response = await fetch('https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          app_id: client_id,
          app_secret: client_secret
      })
  });
  return response.json();
}

async function fetchOIDCAccessToken(app_access_token, grant_type, code) {
  const response = await fetch('https://open.larksuite.com/open-apis/authen/v1/oidc/access_token', {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${app_access_token}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          grant_type: grant_type,
          code: code
      })
  });
  return response.json();
}

async function handleRequest(request) {
  if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new Response('Unauthorized', { status: 401 });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = atob(base64Credentials).split(':');
  const client_id = credentials[0];
  const client_secret = credentials[1];

  const formData = await request.formData();
  const body = {};
  for (const entry of formData.entries()) {
        body[entry[0]] = entry[1];
    }
  const { redirect_uri, code, grant_type } = body;

  // 1.获取 app_access_token
  const appAccessTokenResponse = await fetchAppAccessToken(client_id, client_secret);
  if (!appAccessTokenResponse.app_access_token) {
      return new Response(JSON.stringify(appAccessTokenResponse), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
      });
  }

  const app_access_token = appAccessTokenResponse.app_access_token;

  // 2.获取 OIDC access_token
  const oidcResponse = await fetchOIDCAccessToken(app_access_token, grant_type, code);

  // 返回响应中的 data
  var newBody = oidcResponse.data;
  if (!newBody) {
    newBody = oidcResponse;
  }
  return new Response(JSON.stringify(newBody), {
      headers: { 'Content-Type': 'application/json' }
  });
}

async function handleRequest2(request) {
    // 检查请求方法是否为 GET
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    // 构建转发的请求
    const url = 'https://open.larksuite.com/open-apis/authen/v1/user_info'

    // 创建新的请求对象，保留原有请求的 headers
    const modifiedRequest = new Request(url, {
      method: 'GET',
      headers: request.headers
    })

    try {
      // 发送请求并获取响应
      const response = await fetch(modifiedRequest)

      // 返回原始响应的 JSON 数据
      const jsonData = await response.json()
      var newBody = jsonData.data;
      if (!newBody) {
        newBody = jsonData;
      } else {
        newBody["sub"] = newBody["union_id"];
      }
      return new Response(JSON.stringify(newBody), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          ...response.headers // 保留原始响应的 headers
        }
      })
    } catch (error) {
      return new Response('Error fetching user info', { status: 500 })
    }
  }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/open-apis/authen/v1/token' && request.method === 'POST') {
        return handleRequest(request);
    }
    if (url.pathname === '/open-apis/authen/v1/user_info' && request.method === 'GET') {
        return handleRequest2(request);
    }
    return new Response('Unauthorized', { status: 401 });
  },
};
