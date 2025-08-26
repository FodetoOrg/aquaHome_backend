//@ts-nocheck
import { FastifyRequest, FastifyReply } from 'fastify';
import * as userService from '../services/user.service';
import { handleError, badRequest } from '../utils/errors';
import { UserRole } from '../types';

// Get all customers for admin
export async function getAllCustomersForAdmin(
  request: FastifyRequest<{
    Querystring: {
      search?: string;
      city?: string;
      status?: 'active' | 'inactive';
      limit?: number;
      offset?: number;
    };
  }>,
  reply: FastifyReply
) {
  try {
    // Check if user is admin
    if (request.user.role !== UserRole.ADMIN) {
      throw badRequest('Only admins can access customer list');
    }

    const { search, city, status, limit, offset } = request.query;

    // Validate pagination parameters
    if (limit && (limit < 1 || limit > 100)) {
      throw badRequest('Limit must be between 1 and 100');
    }

    if (offset && offset < 0) {
      throw badRequest('Offset must be non-negative');
    }

    const filters = {
      search,
      city,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    };

    const result = await userService.getAllCustomersForAdmin(filters);

    return reply.code(200).send({
      success: true,
      ...result
    });
  } catch (error) {
    handleError(error, request, reply);
  }
}

export async function getProfileDetails(request: FastifyRequest, reply: FastifyReply) {
    try {
        const user = request.user;
        if (!user) {
            throw new Error('User not authenticated');
        }

        console.log('Getting profile for user:', { userId: user.userId, role: user.role });
        
        const profileDetails = await userService.getProfileDetails(user.userId, user.role);
        
        console.log('Profile details returned:', JSON.stringify(profileDetails, null, 2));
        
        return reply.code(200).send({
            success: true,
            data: profileDetails
        });
    } catch (error) {
        console.error('Error in getProfileDetails:', error);
        handleError(error, request, reply);
    }
}
