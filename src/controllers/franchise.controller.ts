//@ts-nocheck
import { FastifyRequest, FastifyReply } from 'fastify';
import * as franchiseService from '../services/franchise.service';
import { handleError, notFound, badRequest, serverError } from '../utils/errors';
import { UserRole } from '../types';


// Get all franchise areas
export async function getAllFranchiseAreas(
  request: FastifyRequest<{ Querystring: any }>,
  reply: FastifyReply
) {
  try {
    const filters = request.query;
    const areas = await franchiseService.getAllFranchiseAreas(filters);
    return reply.code(200).send(areas);
  } catch (error) {
    handleError(error, request, reply);
  }
}

// Get franchise area by ID
export async function getFranchiseAreaById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const area = await franchiseService.getFranchiseAreaById(id);
    console.log('area ',area)
    if (!area) throw notFound('Franchise Area');
    return reply.code(200).send({ franchiseArea: area });
  } catch (error) {
    handleError(error, request, reply);
  }
}

// Create a new franchise area
export async function createFranchiseArea(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const parts = request.parts();
    const fields: Record<string, any> = {};
    let gstDocument: string | undefined;
    const identityProofImages: string[] = [];

    for await (const part of parts) {
      if (part.file) {
        // This is a file field
        const filename = `franchises/${Date.now()}-${part.filename}`;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        if (part.fieldname === 'gst_document') {
          const uploadedUrl = await request.server.uploadToStorage(buffer, filename, part.mimetype);
          gstDocument = uploadedUrl;
        } else if (part.fieldname === 'identity_proof') {
          const uploadedUrl = await request.server.uploadToStorage(buffer, filename, part.mimetype);
          identityProofImages.push(uploadedUrl);
        }
      } else {
        // This is a regular field
        fields[part.fieldname] = part.value;
      }
    }

    // Validate that at least one identity proof image is provided
    // if (identityProofImages.length === 0) {
    //   throw badRequest('At least one identity proof document is required');
    // }

    // Determine franchise type and validation requirements
    const franchiseType = fields.franchiseType || 'COMPANY_MANAGED';
    let needsGst = false;
    let needsPhone = false;
    let needsIdentityProof = false;

    switch (franchiseType) {
        case 'BOUGHT':
            // Franchise owner who buys franchise - needs everything
            needsGst = true;
            needsPhone = true;
            needsIdentityProof = true;
            break;
        case 'MANAGED':
            // Franchise manager (role is franchise_owner) - needs phone and identity proof, but no GST
            needsGst = false;
            needsPhone = true;
            needsIdentityProof = true;
            break;
        case 'COMPANY_MANAGED':
            // Directly managed by company - needs nothing
            needsGst = false;
            needsPhone = false;
            needsIdentityProof = false;
            break;
        default:
            throw badRequest("Invalid franchise type. Must be 'BOUGHT', 'MANAGED', or 'COMPANY_MANAGED'");
    }

    // Validate required fields based on franchise type
    if (needsPhone && !fields.phonenumber) {
        throw badRequest("Phone number is required for this franchise type");
    }

    if (needsGst && !fields.gst_number) {
        throw badRequest("GST number is required for bought franchises");
    }

    if (needsIdentityProof && identityProofImages.length === 0) {
        throw badRequest("Identity proof documents are required for this franchise type");
    }

    const parsedData = {
      name: fields.name,
      fullname: fields.fullname,
      city: fields.city,
      phonenumber: needsPhone ? fields.phonenumber : undefined,
      gst_number: needsGst ? fields.gst_number : undefined,
      gst_document: needsGst ? gstDocument : undefined,
      identity_proof: needsIdentityProof ? identityProofImages : [],
      geoPolygon: fields.geoPolygon ? JSON.parse(fields.geoPolygon) : undefined,
      franchiseType: franchiseType,
    };

    console.log('parsedData ',parsedData)

    const createdFranchiseArea = await franchiseService.createFranchiseArea(parsedData);

    // Return the created franchise area
    return reply.status(201).send({
      id: createdFranchiseArea.id,
      name: createdFranchiseArea.name,
      fullname: createdFranchiseArea.fullname,
      city: createdFranchiseArea.city,
      phonenumber: createdFranchiseArea.phonenumber,
      gst_number: createdFranchiseArea.gst_number,
      gst_document: createdFranchiseArea.gst_document,
      identity_proof: createdFranchiseArea.identity_proof,
      geoPolygon: createdFranchiseArea.geoPolygon,
      isCompanyManaged: createdFranchiseArea.isCompanyManaged,
      franchiseType: createdFranchiseArea.franchiseType,
    });
  } catch (error) {
    console.log('error ',error)
    request.server.log.error('Error creating franchise area:', error);
    throw serverError('Failed to create franchise area');
  }
}

// Update franchise area
export async function updateFranchiseArea(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    
    // First, get the existing franchise data to check current documents
    const existingFranchise = await franchiseService.getFranchiseAreaById(id);
    if (!existingFranchise) {
      throw notFound('Franchise Area');
    }
    
    const parts = request.parts();
    const fields: Record<string, any> = {};
    let gstDocument: string | undefined;
    const identityProofImages: string[] = [];
    let hasNewGstDocument = false;
    let hasNewIdentityProof = false;

    for await (const part of parts) {
      if (part.file) {
        // This is a file field - new uploads
        const filename = `franchises/${id}/${Date.now()}-${part.filename}`;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        if (part.fieldname === 'gst_document') {
          const uploadedUrl = await request.server.uploadToStorage(buffer, filename, part.mimetype);
          gstDocument = uploadedUrl;
          hasNewGstDocument = true;
        } else if (part.fieldname === 'identity_proof') {
          const uploadedUrl = await request.server.uploadToStorage(buffer, filename, part.mimetype);
          identityProofImages.push(uploadedUrl);
          hasNewIdentityProof = true;
        }
      } else {
        // This is a regular field
        fields[part.fieldname] = part.value;
      }
    }

    // Handle field name mapping from frontend
    const mappedFields = {
      name: fields.name || fields.franchise_name,
      fullname: fields.fullname,
      city: fields.city || fields.cityname,
      phonenumber: fields.phonenumber || fields.phonenumebr || fields.phoneNumber,
      gst_number: fields.gst_number,
      franchiseType: fields.franchiseType || fields.franchise_type,
      existingGstDocument: fields.existingGstDocument,
      existingIdentityProof: fields.existingIdentityProof
    };

    // Determine franchise type and validation requirements
    const franchiseType = mappedFields.franchiseType || existingFranchise.franchiseType;
    let needsGst = false;
    let needsPhone = false;
    let needsIdentityProof = false;

    switch (franchiseType) {
        case 'BOUGHT':
            // Franchise owner who buys franchise - needs everything
            needsGst = true;
            needsPhone = true;
            needsIdentityProof = true;
            break;
        case 'MANAGED':
            // Franchise manager (role is franchise_owner) - needs phone and identity proof, but no GST
            needsGst = false;
            needsPhone = true;
            needsIdentityProof = true;
            break;
        case 'COMPANY_MANAGED':
            // Company managed franchises need nothing
            needsGst = false;
            needsPhone = false;
            needsIdentityProof = false;
            break;
        default:
            throw badRequest("Invalid franchise type. Must be 'BOUGHT', 'MANAGED', or 'COMPANY_MANAGED'");
    }

    // Parse existing documents from frontend
    let existingGstDoc = null;
    let existingIdentityDocs: string[] = [];

    if (mappedFields.existingGstDocument) {
      try {
        existingGstDoc = mappedFields.existingGstDocument;
      } catch (error) {
        console.warn('Failed to parse existing GST document:', error);
      }
    }

    if (mappedFields.existingIdentityProof) {
      try {
        existingIdentityDocs = JSON.parse(mappedFields.existingIdentityProof);
      } catch (error) {
        console.warn('Failed to parse existing identity proof:', error);
      }
    }

    // Validate required fields based on franchise type
    // For phone number, check if we have existing OR new value
    if (needsPhone && !mappedFields.phonenumber && !existingFranchise.phonenumber) {
        throw badRequest("Phone number is required for this franchise type");
    }

    // For GST number, check if we have existing OR new value
    if (needsGst && !mappedFields.gst_number && !existingFranchise.gst_number) {
        throw badRequest("GST number is required for bought franchises");
    }

    // For identity proof, check if we have existing documents OR new documents
    const hasExistingIdentityProof = (existingIdentityDocs && existingIdentityDocs.length > 0) || 
                                   (existingFranchise.identity_proof && existingFranchise.identity_proof.length > 0);
    const hasNewIdentityProofDocuments = identityProofImages.length > 0;
    
    if (needsIdentityProof && !hasExistingIdentityProof && !hasNewIdentityProofDocuments) {
        throw badRequest("Identity proof documents are required for this franchise type");
    }

    // Prepare update data, preserving existing documents if no new ones are provided
    const updateData = {
      name: mappedFields.name || existingFranchise.name,
      fullname: mappedFields.fullname || existingFranchise.fullname,
      city: mappedFields.city || existingFranchise.city,
      phonenumber: mappedFields.phonenumber || existingFranchise.phonenumber,
      gst_number: mappedFields.gst_number || existingFranchise.gst_number,
      gst_document: hasNewGstDocument ? gstDocument : (existingGstDoc || existingFranchise.gst_document),
      identity_proof: hasNewIdentityProof ? identityProofImages : (existingIdentityDocs || existingFranchise.identity_proof),
      // Preserve existing geoPolygon data - don't try to update it
      geoPolygon: existingFranchise.geoPolygon,
      isCompanyManaged: mappedFields.isCompanyManaged !== undefined ? mappedFields.isCompanyManaged === 'true' : existingFranchise.isCompanyManaged,
      isActive: mappedFields.isActive !== undefined ? mappedFields.isActive === 'true' : existingFranchise.isActive,
      franchiseType: franchiseType,
      phoneNumber: mappedFields.phoneNumber || existingFranchise.phoneNumber // Keep for backward compatibility
    };

    console.log('updateData ', updateData);

    const area = await franchiseService.updateFranchiseArea(id, updateData);
    return reply.code(200).send({ message: 'Franchise area updated', franchiseArea: area });
  } catch (error) {
    handleError(error, request, reply);
  }
}

// Assign franchise owner
export async function assignFranchiseOwner(
  request: FastifyRequest<{ Params: { id: string }; Body: { ownerId: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const { ownerId } = request.body;
    const area = await franchiseService.assignFranchiseOwner(id, ownerId);
    return reply.code(200).send({ message: 'Franchise owner assigned', franchiseArea: area });
  } catch (error) {
    handleError(error, request, reply);
  }
}

// Assign service agent
export async function assignServiceAgent(
  request: FastifyRequest<{ Params: { id: string }; Body: { agentId: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const { agentId } = request.body;
    const user = request.user;
    const agent = await franchiseService.assignServiceAgent(id, agentId, user);
    return reply.code(200).send({ message: 'Service agent assigned', agent });
  } catch (error) {
    handleError(error, request, reply);
  }
}

// Get all service agents for a franchise area
export async function getServiceAgents(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const agents = await franchiseService.getServiceAgents(id);
    return reply.code(200).send({ agents });
  } catch (error) {
    handleError(error, request, reply);
  }
}

// Upload franchise document (GST document or Identity proof)
export async function uploadFranchiseDocument(
  request: FastifyRequest<{
    Params: { id: string; documentType: 'gst_document' | 'identity_proof' }
  }>,
  reply: FastifyReply
) {
  try {
    const { id, documentType } = request.params;

    // Get the file from the request
    const file = await request.file();
    if (!file) {
      throw badRequest('No file uploaded');
    }

    // Check file type (allow PDF and image files)
    const { mimetype } = file;
    if (!mimetype.includes('pdf') && !mimetype.includes('image')) {
      throw badRequest('Only PDF and image files are allowed');
    }

    // Upload to storage
    const buffer = await file.toBuffer();
    const filename = `franchises/${id}/${documentType}/${Date.now()}_${file.filename}`;
    const documentUrl = await request.server.uploadToStorage(buffer, filename, mimetype);

    // Update the franchise with the new document URL
    const updateData: any = {};
    if (documentType === 'gst_document') {
      updateData.gst_document = documentUrl;
    } else if (documentType === 'identity_proof') {
      // Get current franchise to append to existing identity_proof array
      const currentFranchise = await franchiseService.getFranchiseAreaById(id);
      if (!currentFranchise) {
        throw notFound('Franchise Area');
      }
      
      const currentIdentityProof = currentFranchise.identity_proof || [];
      const updatedIdentityProof = [...currentIdentityProof, documentUrl];
      updateData.identity_proof = updatedIdentityProof;
    }

    await franchiseService.updateFranchiseArea(id, updateData);

    return reply.code(200).send({
      message: `Franchise ${documentType} uploaded successfully`,
      documentUrl,
      documentType,
      totalDocuments: documentType === 'identity_proof' ? updateData.identity_proof.length : 1
    });
  } catch (error) {
    handleError(error, request, reply);
  }
}

// Remove individual identity proof image
export async function removeIdentityProofImage(
  request: FastifyRequest<{
    Params: { id: string; imageIndex: string }
  }>,
  reply: FastifyReply
) {
  try {
    const { id, imageIndex } = request.params;
    const index = parseInt(imageIndex);

    if (isNaN(index) || index < 0) {
      throw badRequest('Invalid image index');
    }

    // Get current franchise
    const currentFranchise = await franchiseService.getFranchiseAreaById(id);
    if (!currentFranchise) {
      throw notFound('Franchise Area');
    }

    const currentIdentityProof = currentFranchise.identity_proof || [];
    
    if (index >= currentIdentityProof.length) {
      throw badRequest('Image index out of range');
    }

    // Remove the image at the specified index
    const removedImage = currentIdentityProof[index];
    const updatedIdentityProof = currentIdentityProof.filter((_, i) => i !== index);

    // Ensure at least one identity proof image remains
    if (updatedIdentityProof.length === 0) {
      throw badRequest('At least one identity proof document is required');
    }

    // Update the franchise
    await franchiseService.updateFranchiseArea(id, {
      identity_proof: updatedIdentityProof
    });

    return reply.code(200).send({
      message: 'Identity proof image removed successfully',
      removedImage,
      remainingImages: updatedIdentityProof.length,
      totalImages: updatedIdentityProof
    });
  } catch (error) {
    handleError(error, request, reply);
  }
} 

// Update franchise status (admin only)
export async function updateFranchiseStatus(
  request: FastifyRequest<{ 
    Params: { id: string }; 
    Body: { status: string; isActive?: boolean; reason?: string } 
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const { status, isActive, reason } = request.body;
    
    const result = await franchiseService.updateFranchiseStatus(id, status, isActive, reason);
    return reply.code(200).send(result);
  } catch (error) {
    handleError(error, request, reply);
  }
} 