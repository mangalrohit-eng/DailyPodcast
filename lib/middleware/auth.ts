/**
 * Authentication Middleware for Dashboard
 * Supports Bearer Token or Basic Auth
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Config } from '../config';

export interface AuthResult {
  authenticated: boolean;
  user?: string;
  error?: string;
}

export class AuthMiddleware {
  /**
   * Verify authentication from request headers
   */
  static verify(req: VercelRequest): AuthResult {
    const dashboardToken = process.env.DASHBOARD_TOKEN;
    const dashboardUser = process.env.DASHBOARD_USER;
    const dashboardPass = process.env.DASHBOARD_PASS;

    // If no auth configured, allow access (dev mode)
    if (!dashboardToken && !dashboardUser) {
      return {
        authenticated: true,
        user: 'anonymous',
      };
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return {
        authenticated: false,
        error: 'No authorization header provided',
      };
    }

    // Bearer token authentication
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      if (dashboardToken && token === dashboardToken) {
        return {
          authenticated: true,
          user: 'token-user',
        };
      }
      
      return {
        authenticated: false,
        error: 'Invalid bearer token',
      };
    }

    // Basic authentication
    if (authHeader.startsWith('Basic ')) {
      const base64Credentials = authHeader.substring(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      if (
        dashboardUser &&
        dashboardPass &&
        username === dashboardUser &&
        password === dashboardPass
      ) {
        return {
          authenticated: true,
          user: username,
        };
      }

      return {
        authenticated: false,
        error: 'Invalid username or password',
      };
    }

    return {
      authenticated: false,
      error: 'Unsupported authentication method',
    };
  }

  /**
   * Middleware wrapper for API endpoints
   */
  static async protect(
    req: VercelRequest,
    res: VercelResponse,
    handler: (req: VercelRequest, res: VercelResponse) => Promise<any>
  ): Promise<any> {
    const authResult = AuthMiddleware.verify(req);

    if (!authResult.authenticated) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authResult.error,
      });
    }

    // Attach user to request
    (req as any).user = authResult.user;

    return handler(req, res);
  }

  /**
   * Check if write operations are allowed
   */
  static requireWrite(req: VercelRequest): boolean {
    const authResult = AuthMiddleware.verify(req);
    return authResult.authenticated;
  }
}

/**
 * Convenience function for wrapping handlers with auth
 */
export function authenticate(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<any>
): (req: VercelRequest, res: VercelResponse) => Promise<any> {
  return async (req: VercelRequest, res: VercelResponse) => {
    return AuthMiddleware.protect(req, res, handler);
  };
}

