// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { UserRole } from '../types';

// Extend the FastifyRequest interface to include the user property
declare module 'fastify' {
  interface FastifyRequest {
    user: {
      userId: string;
      role: UserRole;
      franchiseAreaId?: string;
      // View As properties
      originalUserId?: string;
      originalRole?: UserRole;
      isViewingAs?: boolean;
      viewAsTargetId?: string;
      viewAsRole?: UserRole;
    };
  }
}

// Extend FastifyInstance to include authenticate method
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: any
    ) => Promise<void>;

    authorizeRoles: (
      roles: UserRole[]
    ) => (request: FastifyRequest, reply: any) => Promise<void>;

    // New: View As functionality
    enableViewAs: (
      adminId: string,
      targetUserId: string,
      targetRole: UserRole,
      franchiseId?: string
    ) => Promise<string>;

    exitViewAs: (
      userId: string
    ) => Promise<string>;
  }
}

interface ViewAsSession {
  originalUserId: string;
  originalRole: UserRole;
  targetUserId: string;
  targetRole: UserRole;
  franchiseAreaId?: string;
  createdAt: Date;
  expiresAt: Date;
}

// In-memory store for view-as sessions (use Redis in production)
const viewAsSessions = new Map<string, ViewAsSession>();

export default fp(async function (fastify: FastifyInstance) {
  // Register JWT verification function with View As support
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: any) {
    try {
      console.log('here token is ', request.headers.authorization);
      const decoded = await request.jwtVerify() as { 
        userId: string; 
        role: UserRole; 
        franchiseAreaId?: string;
        // View As properties in JWT
        originalUserId?: string;
        originalRole?: UserRole;
        isViewingAs?: boolean;
        viewAsTargetId?: string;
        viewAsRole?: UserRole;
      };
      
      console.log('here in jwt decoded ', decoded);
      
      // If this is a view-as token, validate the session
      if (decoded.isViewingAs && decoded.originalUserId) {
        const sessionKey = `${decoded.originalUserId}:${decoded.viewAsTargetId}`;
        const session = viewAsSessions.get(sessionKey);
        
        if (!session || session.expiresAt < new Date()) {
          // Session expired or invalid
          viewAsSessions.delete(sessionKey);
          reply.status(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'View-as session expired or invalid'
          });
          return;
        }
        
        // Set user context for view-as mode
        request.user = {
          userId: decoded.viewAsTargetId,
          role: decoded.viewAsRole,
          franchiseAreaId: session.franchiseAreaId,
          originalUserId: decoded.originalUserId,
          originalRole: decoded.originalRole,
          isViewingAs: true,
          viewAsTargetId: decoded.viewAsTargetId,
          viewAsRole: decoded.viewAsRole,
        };
      } else {
        // Normal user context
        request.user = {
          userId: decoded.userId,
          role: decoded.role,
          franchiseAreaId: decoded.franchiseAreaId,
        };
      }
      
      console.log("request.user here ", request.user);
    } catch (err) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
  });

  // Enhanced role-based access control with View As support
  fastify.decorate('authorizeRoles', function (roles: UserRole[]) {
    return async function (request: FastifyRequest, reply: any) {
      try {
        await request.jwtVerify();
        console.log('request.user in authorizeRoles ',request.user)
        // For view-as mode, check both current role and original role permissions
        if (request.user.isViewingAs) {
          // The user should have permission both as the original role and the target role
          const hasOriginalPermission = roles.includes(request.user.originalRole);
          const hasTargetPermission = roles.includes(request.user.role);
          
          // Admin viewing as someone should always be allowed if they have original permission
          if (request.user.originalRole === UserRole.ADMIN && hasOriginalPermission) {
            return; // Allow admin to view as anyone
          }
          
          // For other roles, both original and target should have permission
          if (!hasOriginalPermission || !hasTargetPermission) {
            reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'You do not have permission to access this resource in view-as mode',
            });
            return;
          }
        } else {
          // Normal permission check
          if (!roles.includes(request.user.role)) {
            reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'You do not have permission to access this resource',
            });
            return;
          }
        }
      } catch (err) {
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }
    };
  });

  // Enable View As functionality
  fastify.decorate('enableViewAs', async function (
    adminId: string,
    targetUserId: string,
    targetRole: UserRole,
    franchiseId?: string
  ) {
    try {
      // Create view-as session
      const sessionKey = `${adminId}:${targetUserId}`;
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2); // 2 hour expiry
      
      const session: ViewAsSession = {
        originalUserId: adminId,
        originalRole: UserRole.ADMIN, // Assuming only admins can view as others
        targetUserId,
        targetRole,
        franchiseAreaId: franchiseId,
        createdAt: new Date(),
        expiresAt,
      };
      
      viewAsSessions.set(sessionKey, session);
      
      // Generate new JWT with view-as information
      const viewAsToken = fastify.jwt.sign({
        userId: adminId, // Keep original user ID for audit
        role: targetRole, // Target role for permissions
        franchiseAreaId: franchiseId,
        // View As specific fields
        originalUserId: adminId,
        originalRole: UserRole.ADMIN,
        isViewingAs: true,
        viewAsTargetId: targetUserId,
        viewAsRole: targetRole,
      }, {
        expiresIn: '2h' // Match session expiry
      });
      
      return viewAsToken;
    } catch (error) {
      console.error('Error enabling view-as:', error);
      throw error;
    }
  });

  // Exit View As functionality
  fastify.decorate('exitViewAs', async function (userId: string) {
    try {
      // Find and remove all sessions for this user
      const keysToDelete = [];
      for (const [key, session] of viewAsSessions.entries()) {
        if (session.originalUserId === userId) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => viewAsSessions.delete(key));
      
      // Generate normal JWT for the original user
      // You'll need to fetch user details from your database
      const normalToken = fastify.jwt.sign({
        userId,
        role: UserRole.ADMIN, // This should come from your user database
        // franchiseAreaId: ... // This should come from your user database
      });
      
      return normalToken;
    } catch (error) {
      console.error('Error exiting view-as:', error);
      throw error;
    }
  });

  // Cleanup expired sessions (run this periodically)
  const cleanupExpiredSessions = () => {
    const now = new Date();
    for (const [key, session] of viewAsSessions.entries()) {
      if (session.expiresAt < now) {
        viewAsSessions.delete(key);
      }
    }
  };

  // Run cleanup every 30 minutes
  setInterval(cleanupExpiredSessions, 30 * 60 * 1000);

  fastify.log.info('Auth plugin with View As feature registered');
});